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



// Interface for Gemini Live response
interface GeminiLiveResponse {
  setupComplete?: boolean;
  serverContent?: {
    modelTurn?: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
    inputTranscription?: {
      text: string;
      finished?: boolean;
    };
    outputTranscription?: {
      text: string;
      finished?: boolean;
    };
    turnComplete?: boolean;
    interrupted?: boolean;
    generationComplete?: boolean;
  };
  toolCall?: {
    functionCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }>;
  };
  toolCallCancellation?: {
    ids: string[];
  };
  usageMetadata?: {
    totalTokenCount: number;
    promptTokenCount: number;
    responseTokenCount: number;
  };
  goAway?: {
    timeLeft: string;
  };
  sessionResumptionUpdate?: {
    newHandle: string;
    resumable: boolean;
  };
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
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        
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

    // Send setup message for Live API
    const setupMessage = {
      setup: {
        model: "models/gemini-2.0-flash-live-001",
        generationConfig: {
          responseModalities: ["TEXT"],
          candidateCount: 1,
          maxOutputTokens: 8192,
          temperature: 0.7,
          topP: 0.95,
          topK: 40
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
            endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
            prefixPaddingMs: 300,
            silenceDurationMs: 1000
          },
          activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
          turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY"
        }
      }
    };

    this.websocket.send(JSON.stringify(setupMessage));
    console.log('📤 Sent initial setup to Gemini Live API');
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

      // Send realtime input to Gemini Live API
      this.websocket.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: "audio/pcm;rate=16000",
            data: base64Audio
          }]
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

      // Handle setup complete
      if (response.setupComplete) {
        console.log('🔗 Gemini Live setup completed');
        return;
      }

      // Handle server content
      if (response.serverContent) {
        const serverContent = response.serverContent;
        
        // Handle model turn (text response)
        if (serverContent.modelTurn && serverContent.modelTurn.parts) {
          for (const part of serverContent.modelTurn.parts) {
            if (part.text && this.resultCallback) {
              this.resultCallback({
                transcript: part.text,
                isFinal: serverContent.turnComplete || false,
                speakerTag: undefined,
                confidence: 1.0
              });
            }
          }
        }

        // Handle input transcription
        if (serverContent.inputTranscription && this.resultCallback) {
          this.resultCallback({
            transcript: serverContent.inputTranscription.text,
            isFinal: serverContent.inputTranscription.finished || false,
            speakerTag: undefined,
            confidence: 1.0
          });
        }
      }

      // Handle errors
      if (response.error) {
        console.error('Gemini Live error:', response.error);
        if (this.errorCallback) {
          this.errorCallback(new Error(response.error.message || 'Unknown error'));
        }
        return;
      }

    } catch (error) {
      console.error('Error parsing Gemini Live response:', error);
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