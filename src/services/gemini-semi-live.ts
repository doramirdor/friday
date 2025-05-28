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
    try {
      this.checkAvailability();
      
      // Add global error handler for unhandled promise rejections
      if (typeof window !== 'undefined') {
        window.addEventListener('unhandledrejection', (event) => {
          if (event.reason && event.reason.message && event.reason.message.includes('Gemini')) {
            console.error('❌ Unhandled Gemini Semi-Live error:', event.reason);
            if (this.errorCallback) {
              this.errorCallback(new Error(`Unhandled error: ${event.reason.message}`));
            }
            event.preventDefault(); // Prevent the error from crashing the app
          }
        });
        
        // Add specific error handler for our service
        window.addEventListener('error', (event) => {
          if (event.error && event.error.stack && event.error.stack.includes('gemini-semi-live')) {
            console.error('🚨 GEMINI SEMI-LIVE CRASH DETECTED:', {
              message: event.error.message,
              stack: event.error.stack,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              timestamp: new Date().toISOString()
            });
            if (this.errorCallback) {
              this.errorCallback(new Error(`Service crashed: ${event.error.message}`));
            }
          }
        });
      }
    } catch (error) {
      console.error('❌ Error initializing Gemini Semi-Live service:', error);
      this._isAvailable = false;
    }
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
      console.log('🔄 Setting up audio processing interval...');
      this.chunkInterval = window.setInterval(() => {
        try {
          console.log('🔄 Audio processing interval triggered');
          this.processAudioChunk().catch(error => {
            console.error('❌ Unhandled error in processAudioChunk:', error);
            if (this.errorCallback) {
              this.errorCallback(new Error(`Audio processing failed: ${error.message}`));
            }
          });
          console.log('🔄 Audio processing interval completed');
        } catch (error) {
          console.error('❌ Error setting up audio chunk processing:', error);
          if (this.errorCallback) {
            this.errorCallback(new Error(`Audio processing setup failed: ${error.message}`));
          }
        }
      }, this.options.chunkDurationMs);
      
      console.log('✅ Audio processing interval set successfully');

      this._isRecording = true;
      console.log('✅ Gemini Semi-Live recording started successfully');
      
      // Add monitoring to detect if the service crashes after startup
      setTimeout(() => {
        console.log('🔍 POST-STARTUP CHECK: Service status after 2 seconds:', {
          isRecording: this._isRecording,
          hasInterval: !!this.chunkInterval,
          audioChunksLength: this.audioChunks.length,
          hasAudioContext: !!this.audioContext,
          audioContextState: this.audioContext?.state,
          hasProcessor: !!this.processor,
          hasMediaStream: !!this.mediaStream,
          timestamp: new Date().toISOString()
        });
      }, 2000);
      
      // Add longer-term monitoring
      setTimeout(() => {
        console.log('🔍 EXTENDED CHECK: Service status after 10 seconds:', {
          isRecording: this._isRecording,
          hasInterval: !!this.chunkInterval,
          audioChunksLength: this.audioChunks.length,
          hasAudioContext: !!this.audioContext,
          audioContextState: this.audioContext?.state,
          hasProcessor: !!this.processor,
          hasMediaStream: !!this.mediaStream,
          timestamp: new Date().toISOString()
        });
        
        if (!this._isRecording) {
          console.error('🚨 SERVICE CRASHED: Recording stopped unexpectedly!');
        }
      }, 10000);
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
        try {
          console.log('🎵 Audio processing event triggered');
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // Safety check: ensure we have valid audio data
          if (!inputData || inputData.length === 0) {
            console.log('⚠️ No audio data in processing event');
            return;
          }
          
          console.log('🎵 Processing audio data:', {
            length: inputData.length,
            currentChunks: this.audioChunks.length
          });
          
          // Safety check: prevent excessive chunk accumulation
          if (this.audioChunks.length > 300) {
            console.warn('⚠️ Audio chunk buffer overflow, dropping oldest chunks');
            this.audioChunks = this.audioChunks.slice(-150); // Keep only recent chunks
          }
          
          // Store audio chunk (create a copy to avoid reference issues)
          this.audioChunks.push(new Float32Array(inputData));
          console.log('🎵 Audio chunk stored, total chunks:', this.audioChunks.length);
        } catch (error) {
          console.error('❌ Error in audio processing event:', error);
          console.error('🚨 AUDIO PROCESSING CRASH:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
          });
          // Don't throw here as it would crash the audio processing
        }
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
    console.log('🔄 processAudioChunk called');
    
    if (this.audioChunks.length === 0) {
      console.log('⚠️ No audio chunks to process');
      return;
    }

    try {
      console.log(`🔄 Processing ${this.audioChunks.length} audio chunks...`);

      // Safety check: prevent memory overflow by limiting chunk accumulation
      if (this.audioChunks.length > 200) {
        console.warn('⚠️ Too many audio chunks accumulated, clearing old chunks to prevent memory overflow');
        this.audioChunks = this.audioChunks.slice(-100); // Keep only the last 100 chunks
      }

      console.log('🔄 Step 1: Calculating total length...');
      // Combine all chunks into a single buffer
      const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log('🔄 Step 1 complete: Total length =', totalLength);
      
      // Safety check: prevent processing extremely large buffers
      if (totalLength > 1000000) { // More than ~60 seconds at 16kHz
        console.warn('⚠️ Audio buffer too large, skipping to prevent crash');
        this.audioChunks.length = 0; // Clear chunks
        return;
      }
      
      console.log('🔄 Step 2: Creating combined buffer...');
      const combinedBuffer = new Float32Array(totalLength);
      console.log('🔄 Step 2 complete: Combined buffer created');
      
      console.log('🔄 Step 3: Copying chunks to combined buffer...');
      let offset = 0;
      for (const chunk of this.audioChunks) {
        combinedBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      console.log('🔄 Step 3 complete: Chunks copied');

      // Clear chunks for next interval
      this.audioChunks.length = 0; // More efficient than reassigning
      console.log('🔄 Step 4: Chunks cleared');

      // Skip if buffer is too small (less than 0.5 seconds of audio)
      const minSamples = (this.options.sampleRateHertz || 16000) * 0.5;
      if (combinedBuffer.length < minSamples) {
        console.log('⚠️ Audio chunk too small, skipping...');
        return;
      }

      console.log('🔄 Step 5: Converting audio for Gemini...');
      // Convert to the format expected by Gemini
      const audioData = this.convertAudioForGemini(combinedBuffer);
      console.log('🔄 Step 5 complete: Audio converted, length =', audioData.length);

      console.log('🔄 Step 6: Calling Gemini API...');
      // Send to Gemini API
      const result = await this.callGeminiAPI(audioData);
      console.log('🔄 Step 6 complete: API call finished');
      
      if (result && this.resultCallback) {
        console.log('🔄 Step 7: Calling result callback...');
        this.resultCallback(result);
        console.log('🔄 Step 7 complete: Result callback finished');
      }

      console.log('✅ processAudioChunk completed successfully');

    } catch (error) {
      console.error('❌ Error processing audio chunk:', error);
      console.error('🚨 PROCESS AUDIO CHUNK CRASH:', {
        error: error.message,
        stack: error.stack,
        audioChunksLength: this.audioChunks.length,
        timestamp: new Date().toISOString()
      });
      
      // Clear chunks on error to prevent accumulation
      this.audioChunks.length = 0;
      
      if (this.errorCallback) {
        this.errorCallback(new Error(`Audio processing failed: ${error.message}`));
      }
    }
  }

  private convertAudioForGemini(audioBuffer: Float32Array): string {
    try {
      console.log('🔄 convertAudioForGemini called with buffer length:', audioBuffer.length);
      
      console.log('🔄 Converting Float32Array to 16-bit PCM...');
      // Convert Float32Array to 16-bit PCM
      const pcmBuffer = new Int16Array(audioBuffer.length);
      for (let i = 0; i < audioBuffer.length; i++) {
        // Convert from [-1, 1] to [-32768, 32767]
        pcmBuffer[i] = Math.max(-32768, Math.min(32767, audioBuffer[i] * 32767));
      }
      console.log('🔄 PCM conversion complete, buffer size:', pcmBuffer.length);

      // Convert to base64 using more efficient approach
      const bytes = new Uint8Array(pcmBuffer.buffer);
      console.log('🔄 Created Uint8Array, size:', bytes.length);
      
      // Use browser's built-in btoa with chunked processing for large buffers
      if (bytes.length > 50000) { // If buffer is large, process in chunks
        console.log('🔄 Using chunked Base64 conversion for large buffer');
        const chunkSize = 50000;
        let base64 = '';
        
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          let binary = '';
          for (let j = 0; j < chunk.length; j++) {
            binary += String.fromCharCode(chunk[j]);
          }
          base64 += btoa(binary);
          console.log(`🔄 Processed chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(bytes.length / chunkSize)}`);
        }
        
        console.log('🔄 Chunked Base64 conversion complete, length:', base64.length);
        return base64;
      } else {
        console.log('🔄 Using direct Base64 conversion for small buffer');
        // For smaller buffers, use the direct approach
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const result = btoa(binary);
        console.log('🔄 Direct Base64 conversion complete, length:', result.length);
        return result;
      }
    } catch (error) {
      console.error('❌ Error converting audio to Base64:', error);
      console.error('🚨 BASE64 CONVERSION CRASH:', {
        error: error.message,
        stack: error.stack,
        bufferLength: audioBuffer?.length || 0,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Audio conversion failed: ${error.message}`);
    }
  }

  private async callGeminiAPI(audioData: string): Promise<GeminiSemiLiveResult | null> {
    try {
      // Safety check: ensure we have an API key
      if (!this.apiKey) {
        throw new Error('Gemini API key is not available');
      }
      
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
    try {
      // Clear interval
      if (this.chunkInterval) {
        clearInterval(this.chunkInterval);
        this.chunkInterval = null;
      }

      // Stop audio processing
      if (this.processor) {
        try {
          this.processor.disconnect();
        } catch (error) {
          console.warn('Warning: Error disconnecting processor:', error);
        }
        this.processor = null;
      }

      // Close audio context
      if (this.audioContext && this.audioContext.state !== 'closed') {
        try {
          this.audioContext.close();
        } catch (error) {
          console.warn('Warning: Error closing audio context:', error);
        }
        this.audioContext = null;
      }

      // Stop media stream
      if (this.mediaStream) {
        try {
          this.mediaStream.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (error) {
              console.warn('Warning: Error stopping track:', error);
            }
          });
        } catch (error) {
          console.warn('Warning: Error stopping media stream:', error);
        }
        this.mediaStream = null;
      }

      // Clear audio chunks
      this.audioChunks.length = 0;
      
      console.log('🧹 Gemini Semi-Live cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      // Force clear everything even if cleanup fails
      this.chunkInterval = null;
      this.processor = null;
      this.audioContext = null;
      this.mediaStream = null;
      this.audioChunks.length = 0;
    }
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