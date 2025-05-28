// Simple Google Speech Live Transcript Service
// Uses the streaming API for true real-time transcription

export interface GoogleLiveTranscriptOptions {
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakers?: number;
  encoding?: 'LINEAR16' | 'WEBM_OPUS';
  sampleRateHertz?: number;
}

export interface GoogleLiveTranscriptResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  speakerId?: string;
  speakers?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

// Interface for Google Speech API response
interface GoogleSpeechAPIResponse {
  results: Array<{
    alternatives: Array<{
      transcript: string;
      confidence: number;
      words?: Array<{
        word: string;
        speakerTag?: number;
      }>;
    }>;
    isFinal?: boolean;
  }>;
}

class GoogleLiveTranscriptService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private processingInterval: number | null = null;
  private isRecording = false;
  private apiKey: string | null = null;
  
  private resultCallback: ((result: GoogleLiveTranscriptResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  
  // Audio buffer for streaming
  private audioBuffer: Float32Array[] = [];

  constructor() {
    this.checkApiKey();
  }

  private checkApiKey() {
    // Try to get API key from electron environment
    const electronWindow = window as unknown as { electronAPI?: { env?: { GOOGLE_SPEECH_API_KEY?: string } } };
    this.apiKey = electronWindow.electronAPI?.env?.GOOGLE_SPEECH_API_KEY || null;
    
    if (!this.apiKey) {
      console.warn('Google Speech API key not found in environment');
    }
  }

  get isAvailable(): boolean {
    return !!(this.apiKey && navigator.mediaDevices && window.AudioContext);
  }

  get isStreaming(): boolean {
    return this.isRecording;
  }

  async startRecording(options: GoogleLiveTranscriptOptions = {}): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Google Live Transcript not available - check API key and browser support');
    }

    if (this.isRecording) {
      console.warn('Already recording');
      return;
    }

    const opts = {
      languageCode: 'en-US',
      enableSpeakerDiarization: true,
      maxSpeakers: 4,
      encoding: 'LINEAR16' as const,
      sampleRateHertz: 16000,
      ...options
    };

    try {
      console.log('🎤 Starting Google Live Transcript...');

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: opts.sampleRateHertz,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: opts.sampleRateHertz });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create processor
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        if (inputData && inputData.length > 0) {
          this.audioBuffer.push(new Float32Array(inputData));
        }
      };

      // Connect audio chain
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Start processing interval (send chunks every 1 second for real-time feel)
      this.processingInterval = window.setInterval(() => {
        this.processAudioBuffer(opts);
      }, 1000);

      this.isRecording = true;
      console.log('✅ Google Live Transcript started');

    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  private async processAudioBuffer(options: Required<GoogleLiveTranscriptOptions>): Promise<void> {
    if (this.audioBuffer.length === 0) return;

    try {
      // Combine audio chunks
      const totalLength = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedBuffer = new Float32Array(totalLength);
      
      let offset = 0;
      for (const chunk of this.audioBuffer) {
        combinedBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      // Clear buffer
      this.audioBuffer = [];

      // Skip if too small
      if (combinedBuffer.length < 8000) return; // 0.5 seconds at 16kHz

      // Convert to base64
      const audioData = this.audioToBase64(combinedBuffer);

      // Call Google Speech API
      const result = await this.callGoogleSpeechAPI(audioData, options);
      
      if (result && this.resultCallback) {
        this.resultCallback(result);
      }

    } catch (error) {
      console.error('Error processing audio buffer:', error);
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

  private async callGoogleSpeechAPI(audioData: string, options: Required<GoogleLiveTranscriptOptions>): Promise<GoogleLiveTranscriptResult | null> {
    try {
      const requestBody = {
        config: {
          encoding: options.encoding,
          sampleRateHertz: options.sampleRateHertz,
          languageCode: options.languageCode,
          enableSpeakerDiarization: options.enableSpeakerDiarization,
          diarizationSpeakerCount: options.maxSpeakers,
          model: 'latest_long',
          useEnhanced: true,
        },
        audio: {
          content: audioData
        }
      };

      const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        return null;
      }

      return this.parseGoogleResponse(data);

    } catch (error) {
      console.error('Google Speech API error:', error);
      return null;
    }
  }

  private parseGoogleResponse(data: GoogleSpeechAPIResponse): GoogleLiveTranscriptResult {
    const result = data.results[0];
    const alternative = result.alternatives[0];
    
    let transcript = alternative.transcript || '';
    const confidence = alternative.confidence || 0;
    const speakers: Array<{ id: string; name: string; color: string }> = [];
    const colors = ["#28C76F", "#7367F0", "#FF9F43", "#EA5455", "#00CFE8", "#9F44D3"];

    // Handle speaker diarization if available
    if (alternative.words) {
      const speakerMap = new Map<number, string>();
      let speakerId: string | undefined;

      // Build speaker transcript
      let speakerTranscript = '';
      let currentSpeaker: number | undefined;

      for (const wordInfo of alternative.words) {
        const speaker = wordInfo.speakerTag || 1;
        
        if (speaker !== currentSpeaker) {
          if (currentSpeaker !== undefined) {
            speakerTranscript += '\n';
          }
          currentSpeaker = speaker;
          speakerTranscript += `Speaker ${speaker}: `;
          
          if (!speakerMap.has(speaker)) {
            speakerMap.set(speaker, `Speaker ${speaker}`);
            speakers.push({
              id: speaker.toString(),
              name: `Speaker ${speaker}`,
              color: colors[speaker % colors.length]
            });
          }
        }
        
        speakerTranscript += wordInfo.word + ' ';
        speakerId = speaker.toString();
      }

      if (speakerTranscript) {
        transcript = speakerTranscript.trim();
      }
    }

    return {
      transcript: transcript.trim(),
      isFinal: result.isFinal || true,
      confidence,
      speakerId: speakers.length > 0 ? speakers[0].id : undefined,
      speakers: speakers.length > 0 ? speakers : undefined
    };
  }

  stopRecording(): void {
    if (!this.isRecording) return;

    this.cleanup();
    this.isRecording = false;
    console.log('✅ Google Live Transcript stopped');
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

    this.audioBuffer = [];
  }

  onResult(callback: (result: GoogleLiveTranscriptResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }
}

// Export singleton
export const googleLiveTranscript = new GoogleLiveTranscriptService();
export default googleLiveTranscript; 