import { DatabaseService } from './database';

// Interface for semi-live Gemini results
export interface GeminiSemiLiveResult {
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

// Interface for semi-live Gemini options
export interface GeminiSemiLiveOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakerCount?: number;
  chunkDurationMs?: number; // How often to send chunks (in milliseconds)
  encoding?: 'LINEAR16' | 'WEBM_OPUS';
}

// Interface for the semi-live Gemini service
export interface GeminiSemiLiveService {
  isAvailable: boolean;
  isRecording: boolean;
  startRecording: (options?: GeminiSemiLiveOptions) => Promise<void>;
  stopRecording: () => void;
  onResult: (callback: (result: GeminiSemiLiveResult) => void) => void;
  onError: (callback: (error: Error) => void) => void;
}

class GeminiSemiLiveServiceImpl implements GeminiSemiLiveService {
  private resultCallback: ((result: GeminiSemiLiveResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private _isRecording = false;
  private _isAvailable = false;
  private apiKey: string | null = null;
  
  // Audio recording state
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private audioChunks: Float32Array[] = [];
  private chunkInterval: number | null = null;
  private options: GeminiSemiLiveOptions = {};

  constructor() {
    this.checkAvailability();
  }

  private checkAvailability() {
    // Check if we have Gemini API key
    const electronWindow = window as unknown as { electronAPI?: { env?: { GEMINI_API_KEY?: string } } };
    this.apiKey = electronWindow.electronAPI?.env?.GEMINI_API_KEY || null;
    
    // Check if we have necessary Web APIs
    const hasWebAPIs = !!(navigator.mediaDevices && window.AudioContext);
    
    this._isAvailable = !!(this.apiKey && hasWebAPIs);
    
    if (!this._isAvailable) {
      if (!this.apiKey) {
        console.warn('Gemini Semi-Live not available - missing API key');
      }
      if (!hasWebAPIs) {
        console.warn('Gemini Semi-Live not available - missing Web APIs');
      }
    } else {
      console.log('✅ Gemini Semi-Live service available');
    }
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  async startRecording(options: GeminiSemiLiveOptions = {}): Promise<void> {
    if (!this._isAvailable) {
      throw new Error('Gemini Semi-Live service is not available');
    }

    if (this._isRecording) {
      console.warn('Recording is already active');
      return;
    }

    try {
      this.options = {
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        enableSpeakerDiarization: true,
        maxSpeakerCount: 4,
        chunkDurationMs: 5000, // Send chunks every 5 seconds
        encoding: 'LINEAR16',
        ...options
      };

      console.log('🎤 Starting Gemini Semi-Live recording with options:', this.options);

      // Start microphone capture
      await this.startMicrophoneCapture();

      // Set up interval to process chunks
      this.chunkInterval = window.setInterval(() => {
        this.processAudioChunk();
      }, this.options.chunkDurationMs);

      this._isRecording = true;
      console.log('✅ Gemini Semi-Live recording started successfully');
    } catch (error) {
      console.error('❌ Failed to start Gemini Semi-Live recording:', error);
      this.cleanup();
      throw error;
    }
  }

  private async startMicrophoneCapture(): Promise<void> {
    try {
      console.log('🎤 Requesting microphone access...');
      
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.options.sampleRateHertz,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      console.log('✅ Microphone access granted');

      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.options.sampleRateHertz
      });

      console.log('✅ AudioContext created with sample rate:', this.audioContext.sampleRate);

      // Create audio source and processor
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Use ScriptProcessorNode for now (will migrate to AudioWorklet later)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Store audio chunk
        this.audioChunks.push(new Float32Array(inputData));
      };

      // Connect the audio processing chain
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      console.log('✅ Audio processing chain connected');
    } catch (error) {
      console.error('❌ Failed to start microphone capture:', error);
      throw new Error(`Microphone capture failed: ${error.message}`);
    }
  }

  private async processAudioChunk(): Promise<void> {
    if (this.audioChunks.length === 0) {
      console.log('⚠️ No audio chunks to process');
      return;
    }

    try {
      console.log(`🔄 Processing ${this.audioChunks.length} audio chunks...`);

      // Combine all chunks into a single buffer
      const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedBuffer = new Float32Array(totalLength);
      
      let offset = 0;
      for (const chunk of this.audioChunks) {
        combinedBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      // Clear chunks for next interval
      this.audioChunks = [];

      // Skip if buffer is too small (less than 0.5 seconds of audio)
      const minSamples = (this.options.sampleRateHertz || 16000) * 0.5;
      if (combinedBuffer.length < minSamples) {
        console.log('⚠️ Audio chunk too small, skipping...');
        return;
      }

      // Convert to the format expected by Gemini
      const audioData = this.convertAudioForGemini(combinedBuffer);

      // Send to Gemini API
      const result = await this.callGeminiAPI(audioData);
      
      if (result && this.resultCallback) {
        this.resultCallback(result);
      }

    } catch (error) {
      console.error('❌ Error processing audio chunk:', error);
      if (this.errorCallback) {
        this.errorCallback(new Error(`Audio processing failed: ${error.message}`));
      }
    }
  }

  private convertAudioForGemini(audioBuffer: Float32Array): string {
    // Convert Float32Array to 16-bit PCM
    const pcmBuffer = new Int16Array(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
      // Convert from [-1, 1] to [-32768, 32767]
      pcmBuffer[i] = Math.max(-32768, Math.min(32767, audioBuffer[i] * 32767));
    }

    // Convert to base64
    const bytes = new Uint8Array(pcmBuffer.buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async callGeminiAPI(audioData: string): Promise<GeminiSemiLiveResult | null> {
    try {
      console.log('🌐 Sending audio to Gemini API...');

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + this.apiKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              inline_data: {
                mime_type: 'audio/pcm',
                data: audioData
              }
            }, {
              text: `Please transcribe this audio with speaker diarization. Format the response as markdown with speaker labels like "**Speaker 1**: [text]". Maximum ${this.options.maxSpeakerCount} speakers. Language: ${this.options.languageCode}.`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        console.log('⚠️ No transcription result from Gemini');
        return null;
      }

      const transcriptText = data.candidates[0].content.parts[0].text;
      console.log('🎯 Gemini transcription result:', transcriptText);

      // Parse the response to extract speakers and transcript
      return this.parseGeminiResponse(transcriptText);

    } catch (error) {
      console.error('❌ Gemini API call failed:', error);
      throw error;
    }
  }

  private parseGeminiResponse(text: string): GeminiSemiLiveResult {
    // Parse markdown-formatted response with speaker labels
    const lines = text.split('\n').filter(line => line.trim());
    const speakers = new Set<string>();
    let transcript = '';

    for (const line of lines) {
      const speakerMatch = line.match(/^\*\*Speaker (\d+)\*\*:\s*(.+)$/);
      if (speakerMatch) {
        const speakerNum = speakerMatch[1];
        const speakerText = speakerMatch[2];
        speakers.add(speakerNum);
        
        if (transcript) transcript += '\n';
        transcript += `Speaker ${speakerNum}: ${speakerText}`;
      } else if (line.trim()) {
        // Handle non-speaker formatted text
        if (transcript) transcript += '\n';
        transcript += line.trim();
      }
    }

    // Generate speaker objects
    const speakerObjects = Array.from(speakers).map(num => ({
      id: num,
      name: `Speaker ${num}`,
      color: this.getSpeakerColor(parseInt(num))
    }));

    return {
      transcript: transcript || text,
      isFinal: true, // All results are final in semi-live approach
      confidence: 0.9, // Gemini doesn't provide confidence, use default
      speakers: speakerObjects
    };
  }

  private getSpeakerColor(speakerNum: number): string {
    const colors = ["#28C76F", "#7367F0", "#FF9F43", "#EA5455", "#00CFE8", "#9F44D3", "#666666", "#FE9900"];
    return colors[speakerNum % colors.length];
  }

  stopRecording(): void {
    if (!this._isRecording) {
      return;
    }

    try {
      this.cleanup();
      this._isRecording = false;
      console.log('✅ Gemini Semi-Live recording stopped');
    } catch (error) {
      console.error('❌ Failed to stop Gemini Semi-Live recording:', error);
    }
  }

  private cleanup(): void {
    // Clear interval
    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }

    // Stop audio processing
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Clear audio chunks
    this.audioChunks = [];
  }

  onResult(callback: (result: GeminiSemiLiveResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  destroy(): void {
    this.stopRecording();
    this.resultCallback = null;
    this.errorCallback = null;
  }
}

// Export singleton instance
export const geminiSemiLiveService = new GeminiSemiLiveServiceImpl();
export default geminiSemiLiveService; 