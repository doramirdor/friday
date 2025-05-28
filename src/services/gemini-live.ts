import { DatabaseService } from './database';

// Interface for Gemini Live streaming results
export interface GeminiLiveResult {
  transcript: string;
  isFinal: boolean;
  speakerTag?: number;
  confidence?: number;
}

// Interface for Gemini Live options
export interface GeminiLiveOptions {
  sampleRateHertz?: number;
  encoding?: 'LINEAR16' | 'FLAC' | 'MULAW' | 'AMR' | 'AMR_WB' | 'OGG_OPUS' | 'SPEEX_WITH_HEADER_BYTE';
  enableSpeakerDiarization?: boolean;
  maxSpeakerCount?: number;
  languageCode?: string;
}

// Interface for audio config message
interface AudioConfig {
  sample_rate_hertz: number;
  encoding: string;
  diarization_config?: {
    enableSpeakerDiarization: boolean;
    maxSpeakerCount?: number;
  };
}

// Interface for text config message
interface TextConfig {
  partial_results: boolean;
}

// Interface for Gemini Live response
interface GeminiLiveResponse {
  choices?: Array<{
    partial: boolean;
    text: string;
    speakerTag?: number;
    confidence?: number;
  }>;
  error?: {
    message: string;
    code?: number;
  };
}

// Interface for the Gemini Live service
export interface GeminiLiveService {
  isAvailable: boolean;
  isStreaming: boolean;
  startStreaming: (options?: GeminiLiveOptions) => Promise<void>;
  stopStreaming: () => void;
  onResult: (callback: (result: GeminiLiveResult) => void) => void;
  onError: (callback: (error: Error) => void) => void;
  cleanup: () => void;
}

class GeminiLiveServiceImpl implements GeminiLiveService {
  private websocket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private resultCallback: ((result: GeminiLiveResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private _isStreaming = false;
  private _isAvailable = false;
  private apiKey: string | null = null;
  private audioChunksBuffer: Blob[] = [];
  private processingInterval: number | null = null;

  // Rolling buffer for speaker segments
  private speakerBuffers = new Map<number, string>();

  constructor() {
    this.checkAvailability();
  }

  private async checkAvailability() {
    try {
      // Check if we have the necessary APIs
      const hasWebSocket = typeof WebSocket !== 'undefined';
      const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
      const hasGetUserMedia = !!(navigator.mediaDevices?.getUserMedia);

      // Get API key from various sources
      const electronAPI = (window as { electronAPI?: { env?: { GEMINI_API_KEY?: string } } }).electronAPI;
      const envApiKey = electronAPI?.env?.GEMINI_API_KEY;
      const settingsApiKey = (await DatabaseService.getSettings())?.geminiApiKey;
      const localStorageApiKey = localStorage.getItem('gemini-api-key');
      
      this.apiKey = envApiKey || settingsApiKey || localStorageApiKey;

      this._isAvailable = hasWebSocket && hasMediaRecorder && hasGetUserMedia && !!this.apiKey;

      if (!this._isAvailable) {
        console.warn('Gemini Live not available:', {
          hasWebSocket,
          hasMediaRecorder,
          hasGetUserMedia,
          hasApiKey: !!this.apiKey
        });
      } else {
        console.log('Gemini Live service available');
      }
    } catch (error) {
      console.error('Error checking Gemini Live availability:', error);
      this._isAvailable = false;
    }
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  async startStreaming(options: GeminiLiveOptions = {}): Promise<void> {
    if (!this._isAvailable) {
      throw new Error('Gemini Live service is not available');
    }

    if (this._isStreaming) {
      console.warn('Gemini Live streaming is already active');
      return;
    }

    if (!this.apiKey) {
      throw new Error('Gemini API key not configured. Please add your API key in settings.');
    }

    try {
      // Default options
      const defaultOptions: Required<GeminiLiveOptions> = {
        sampleRateHertz: 16000,
        encoding: 'LINEAR16',
        enableSpeakerDiarization: true,
        maxSpeakerCount: 4,
        languageCode: 'en-US',
        ...options
      };

      // Start microphone capture
      await this.startMicrophoneCapture(defaultOptions);

      // Connect to Gemini Live WebSocket
      await this.connectWebSocket(defaultOptions);

      this._isStreaming = true;
      console.log('✅ Gemini Live streaming started successfully');
    } catch (error) {
      console.error('❌ Failed to start Gemini Live streaming:', error);
      this.cleanup();
      throw error;
    }
  }

  private async startMicrophoneCapture(options: Required<GeminiLiveOptions>): Promise<void> {
    try {
      // Get microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: options.sampleRateHertz,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create MediaRecorder for audio capture
      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error('Required audio format not supported');
      }

      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType,
        audioBitsPerSecond: 16000
      });

      this.audioChunksBuffer = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunksBuffer.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        if (this.errorCallback) {
          this.errorCallback(new Error('Microphone recording error'));
        }
      };

      // Start recording with small time slices for near real-time streaming
      this.mediaRecorder.start(100); // 100ms chunks

      console.log('🎤 Microphone capture started');
    } catch (error) {
      console.error('Failed to start microphone capture:', error);
      throw new Error(`Microphone access failed: ${error.message}`);
    }
  }

  private async connectWebSocket(options: Required<GeminiLiveOptions>): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `wss://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${this.apiKey}`;
        
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          console.log('🔗 Gemini Live WebSocket connected');
          
          // Send initial configuration
          this.sendInitialConfig(options);
          
          // Start processing audio chunks
          this.startAudioProcessing();
          
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleWebSocketMessage(event.data);
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(new Error('Failed to connect to Gemini Live'));
        };

        this.websocket.onclose = (event) => {
          console.log('🔌 Gemini Live WebSocket closed:', event.code, event.reason);
          if (this._isStreaming) {
            // Unexpected close
            if (this.errorCallback) {
              this.errorCallback(new Error('Connection to Gemini Live lost'));
            }
          }
          this._isStreaming = false;
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private sendInitialConfig(options: Required<GeminiLiveOptions>): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send audio configuration
    const audioConfig: AudioConfig = {
      sample_rate_hertz: options.sampleRateHertz,
      encoding: options.encoding,
      ...(options.enableSpeakerDiarization && {
        diarization_config: {
          enableSpeakerDiarization: true,
          maxSpeakerCount: options.maxSpeakerCount
        }
      })
    };

    // Send text configuration
    const textConfig: TextConfig = {
      partial_results: true
    };

    // Send configuration messages
    this.websocket.send(JSON.stringify({
      audio_config: audioConfig
    }));

    this.websocket.send(JSON.stringify({
      text_config: textConfig
    }));

    console.log('📤 Sent initial configuration to Gemini Live');
  }

  private startAudioProcessing(): void {
    // Process audio chunks every 100ms
    this.processingInterval = window.setInterval(() => {
      this.processAudioChunks();
    }, 100);
  }

  private async processAudioChunks(): Promise<void> {
    if (this.audioChunksBuffer.length === 0 || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // Get all pending chunks
      const chunks = [...this.audioChunksBuffer];
      this.audioChunksBuffer = [];

      // Convert chunks to a single blob
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      
      // Convert to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Convert to base64
      const base64Audio = this.arrayBufferToBase64(arrayBuffer);

      // Send audio frame to Gemini Live
      this.websocket.send(JSON.stringify({
        audio: {
          audio: base64Audio
        }
      }));

    } catch (error) {
      console.error('Error processing audio chunks:', error);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private handleWebSocketMessage(data: string): void {
    try {
      const response: GeminiLiveResponse = JSON.parse(data);

      if (response.error) {
        console.error('Gemini Live error:', response.error);
        if (this.errorCallback) {
          this.errorCallback(new Error(response.error.message));
        }
        return;
      }

      if (response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        
        // Handle speaker diarization with rolling buffer
        if (choice.speakerTag !== undefined) {
          this.updateSpeakerBuffer(choice.speakerTag, choice.text, choice.partial);
        }

        // Send result to callback
        if (this.resultCallback) {
          this.resultCallback({
            transcript: choice.text,
            isFinal: !choice.partial,
            speakerTag: choice.speakerTag,
            confidence: choice.confidence
          });
        }
      }
    } catch (error) {
      console.error('Error parsing Gemini Live response:', error);
    }
  }

  private updateSpeakerBuffer(speakerTag: number, text: string, isPartial: boolean): void {
    if (isPartial) {
      // Update the rolling buffer for this speaker
      this.speakerBuffers.set(speakerTag, text);
    } else {
      // Final result - commit the segment and clear buffer
      this.speakerBuffers.delete(speakerTag);
    }
  }

  stopStreaming(): void {
    if (!this._isStreaming) {
      return;
    }

    console.log('🛑 Stopping Gemini Live streaming');
    this.cleanup();
    this._isStreaming = false;
  }

  cleanup(): void {
    // Stop audio processing
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Stop media recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    // Stop audio stream
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    // Close WebSocket
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
    }
    this.websocket = null;

    // Clear buffers
    this.audioChunksBuffer = [];
    this.speakerBuffers.clear();

    console.log('🧹 Gemini Live cleanup completed');
  }

  onResult(callback: (result: GeminiLiveResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  // Method to reinitialize when settings change
  async reinitialize(): Promise<void> {
    await this.checkAvailability();
  }
}

// Export singleton instance
export const geminiLiveService = new GeminiLiveServiceImpl();
export default geminiLiveService; 