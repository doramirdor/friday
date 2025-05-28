// Simple Gemini Live Transcript Service
// Uses REST API with short chunks for near real-time transcription

export interface GeminiLiveTranscriptOptions {
  languageCode?: string;
  chunkDurationMs?: number; // How often to send chunks (default: 2000ms)
  enableSpeakerDiarization?: boolean;
  maxSpeakers?: number;
}

export interface GeminiLiveTranscriptResult {
  transcript: string;
  isFinal: boolean;
  speakers?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

class GeminiLiveTranscriptService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private audioChunks: Float32Array[] = [];
  private processingInterval: number | null = null;
  private isRecording = false;
  private apiKey: string | null = null;
  
  private resultCallback: ((result: GeminiLiveTranscriptResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  constructor() {
    this.checkApiKey();
  }

  private checkApiKey() {
    // Try to get API key from electron environment
    const electronWindow = window as unknown as { electronAPI?: { env?: { GEMINI_API_KEY?: string } } };
    this.apiKey = electronWindow.electronAPI?.env?.GEMINI_API_KEY || null;
    
    if (!this.apiKey) {
      console.warn('Gemini API key not found in environment');
    }
  }

  get isAvailable(): boolean {
    return !!(this.apiKey && navigator.mediaDevices && window.AudioContext);
  }

  get isStreaming(): boolean {
    return this.isRecording;
  }

  async startRecording(options: GeminiLiveTranscriptOptions = {}): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Gemini Live Transcript not available - check API key and browser support');
    }

    if (this.isRecording) {
      console.warn('Already recording');
      return;
    }

    const opts = {
      languageCode: 'en-US',
      chunkDurationMs: 2000, // 2 seconds for responsive feel
      enableSpeakerDiarization: true,
      maxSpeakers: 4,
      ...options
    };

    try {
      console.log('🎤 Starting Gemini Live Transcript...');

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create processor
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        if (inputData && inputData.length > 0) {
          this.audioChunks.push(new Float32Array(inputData));
        }
      };

      // Connect audio chain
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Start processing interval
      this.processingInterval = window.setInterval(() => {
        this.processAudioChunks(opts);
      }, opts.chunkDurationMs);

      this.isRecording = true;
      console.log('✅ Gemini Live Transcript started');

    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  private async processAudioChunks(options: Required<GeminiLiveTranscriptOptions>): Promise<void> {
    if (this.audioChunks.length === 0) return;

    try {
      // Combine chunks
      const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedBuffer = new Float32Array(totalLength);
      
      let offset = 0;
      for (const chunk of this.audioChunks) {
        combinedBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      // Clear chunks
      this.audioChunks = [];

      // Skip if too small (less than 0.5 seconds)
      if (combinedBuffer.length < 8000) return; // 0.5 seconds at 16kHz

      // Convert to PCM and base64
      const audioData = this.audioToBase64(combinedBuffer);

      // Call Gemini API
      const result = await this.callGeminiAPI(audioData, options);
      
      if (result && this.resultCallback) {
        this.resultCallback(result);
      }

    } catch (error) {
      console.error('Error processing audio chunks:', error);
      if (this.errorCallback) {
        this.errorCallback(error);
      }
    }
  }

  private audioToBase64(audioBuffer: Float32Array): string {
    // Convert to 16-bit PCM
    const pcmBuffer = new Int16Array(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
      pcmBuffer[i] = Math.max(-32768, Math.min(32767, audioBuffer[i] * 32767));
    }

    // Convert to base64
    const bytes = new Uint8Array(pcmBuffer.buffer);
    let binary = '';
    
    // Process in chunks to avoid string length issues
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    
    return btoa(binary);
  }

  private async callGeminiAPI(audioData: string, options: Required<GeminiLiveTranscriptOptions>): Promise<GeminiLiveTranscriptResult | null> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              inline_data: {
                mime_type: 'audio/pcm',
                data: audioData
              }
            }, {
              text: `Transcribe this audio. Language: ${options.languageCode}. ${options.enableSpeakerDiarization ? `Use speaker diarization with max ${options.maxSpeakers} speakers. Format: "**Speaker N**: text"` : ''}`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) return null;

      return this.parseResponse(text);

    } catch (error) {
      console.error('Gemini API error:', error);
      return null;
    }
  }

  private parseResponse(text: string): GeminiLiveTranscriptResult {
    const speakers: Array<{ id: string; name: string; color: string }> = [];
    const colors = ["#28C76F", "#7367F0", "#FF9F43", "#EA5455", "#00CFE8", "#9F44D3"];
    
    // Parse speaker format
    const transcript = text;
    const speakerMatches = text.match(/\*\*Speaker (\d+)\*\*:\s*(.+)/g);
    
    if (speakerMatches) {
      speakerMatches.forEach(match => {
        const speakerMatch = match.match(/\*\*Speaker (\d+)\*\*:\s*(.+)/);
        if (speakerMatch) {
          const speakerNum = parseInt(speakerMatch[1]);
          if (!speakers.find(s => s.id === speakerNum.toString())) {
            speakers.push({
              id: speakerNum.toString(),
              name: `Speaker ${speakerNum}`,
              color: colors[speakerNum % colors.length]
            });
          }
        }
      });
    }

    return {
      transcript: transcript.trim(),
      isFinal: true,
      speakers: speakers.length > 0 ? speakers : undefined
    };
  }

  stopRecording(): void {
    if (!this.isRecording) return;

    this.cleanup();
    this.isRecording = false;
    console.log('✅ Gemini Live Transcript stopped');
  }

  private cleanup(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.audioChunks = [];
  }

  onResult(callback: (result: GeminiLiveTranscriptResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }
}

// Export singleton
export const geminiLiveTranscript = new GeminiLiveTranscriptService();
export default geminiLiveTranscript; 