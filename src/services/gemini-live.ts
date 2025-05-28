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
      // Based on Live API docs, prioritize formats that work well with the API
      const supportedMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ];

      let selectedMimeType = '';
      for (const mimeType of supportedMimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          console.log(`✅ Selected audio format: ${mimeType}`);
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error('No supported audio format found for Live API');
      }

      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: selectedMimeType,
        audioBitsPerSecond: 128000 // Good quality for speech
      });

      this.audioChunksBuffer = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`🎤 Audio chunk received: ${event.data.size} bytes, type: ${event.data.type}`);
          this.audioChunksBuffer.push(event.data);
        } else {
          console.log('🎤 Empty audio chunk received');
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
      console.log('🎤 MediaRecorder state:', this.mediaRecorder.state);
      console.log('🎤 MediaRecorder mimeType:', this.mediaRecorder.mimeType);
      console.log('🎤 Selected MIME type:', selectedMimeType);
      
      // Add a test to see if we're getting audio levels
      if (this.audioStream) {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(this.audioStream);
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkAudioLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          if (average > 0) {
            console.log('🔊 Audio level detected:', average);
          }
        };
        
        // Check audio level every 2 seconds for debugging
        const levelCheckInterval = setInterval(checkAudioLevel, 2000);
        
        // Clean up after 10 seconds
        setTimeout(() => {
          clearInterval(levelCheckInterval);
          audioContext.close();
        }, 10000);
      }
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

        this.websocket.onmessage = async (event) => {
          await this.handleWebSocketMessage(event.data);
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(new Error('Failed to connect to Gemini Live'));
        };

        this.websocket.onclose = (event) => {
          console.log('🔌 Gemini Live WebSocket closed:', event.code, event.reason);
          console.log('🔌 Close event details:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            isStreaming: this._isStreaming
          });
          
          if (this._isStreaming) {
            // Unexpected close - provide more detailed error information
            let errorMessage = 'Connection to Gemini Live lost';
            
            // Provide specific error messages based on close codes
            switch (event.code) {
              case 1000:
                errorMessage = 'Gemini Live connection closed normally';
                break;
              case 1001:
                errorMessage = 'Gemini Live server is going away';
                break;
              case 1002:
                errorMessage = 'Gemini Live protocol error';
                break;
              case 1003:
                errorMessage = 'Gemini Live received unsupported data';
                break;
              case 1006:
                errorMessage = 'Gemini Live connection lost abnormally (network issue)';
                break;
              case 1011:
                errorMessage = 'Gemini Live server encountered an error';
                break;
              case 1012:
                errorMessage = 'Gemini Live server is restarting';
                break;
              case 1013:
                errorMessage = 'Gemini Live server is temporarily overloaded';
                break;
              case 1014:
                errorMessage = 'Gemini Live bad gateway';
                break;
              case 1015:
                errorMessage = 'Gemini Live TLS handshake failed';
                break;
              default:
                errorMessage = `Gemini Live connection closed with code ${event.code}: ${event.reason || 'Unknown reason'}`;
            }
            
            if (this.errorCallback) {
              this.errorCallback(new Error(errorMessage));
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

    // Send setup message for Live API - corrected format based on official docs
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
        },
        inputAudioTranscription: {}
      }
    };

    this.websocket.send(JSON.stringify(setupMessage));
    console.log('📤 Sent initial setup to Gemini Live API with corrected format');
  }

  private startAudioProcessing(): void {
    // Process audio chunks every 100ms
    this.processingInterval = window.setInterval(() => {
      this.processAudioChunks();
    }, 100);
    
    // Add connection health monitoring
    this.startConnectionHealthCheck();
  }

  private startConnectionHealthCheck(): void {
    // Check connection health every 5 seconds
    const healthCheckInterval = setInterval(() => {
      if (this.websocket) {
        console.log('🔍 WebSocket health check:', {
          readyState: this.websocket.readyState,
          readyStateText: this.getReadyStateText(this.websocket.readyState),
          isStreaming: this._isStreaming
        });
        
        // If connection is closed but we're still supposed to be streaming, that's an issue
        if (this.websocket.readyState === WebSocket.CLOSED && this._isStreaming) {
          console.error('🚨 WebSocket connection lost while streaming!');
        }
      }
      
      // Clean up if not streaming
      if (!this._isStreaming) {
        clearInterval(healthCheckInterval);
      }
    }, 5000);
  }

  private getReadyStateText(readyState: number): string {
    switch (readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  private async processAudioChunks(): Promise<void> {
    if (this.audioChunksBuffer.length === 0 || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // Get all pending chunks
      const chunks = [...this.audioChunksBuffer];
      this.audioChunksBuffer = [];

      console.log(`🎵 Processing ${chunks.length} audio chunks, total size: ${chunks.reduce((sum, chunk) => sum + chunk.size, 0)} bytes`);

      // Convert chunks to a single blob
      const audioBlob = new Blob(chunks);
      
      // Convert to ArrayBuffer for Live API
      const audioData = await audioBlob.arrayBuffer();
      
      // Convert to base64 as required by Live API
      const base64Audio = this.arrayBufferToBase64(audioData);

      // Send realtime input to Gemini Live API using correct format from official docs
      const message = {
        realtimeInput: {
          audio: {
            data: base64Audio,
            mimeType: "audio/webm;codecs=opus"
          }
        }
      };

      this.websocket.send(JSON.stringify(message));
      console.log(`📤 Sent audio chunk: ${base64Audio.length} characters (${audioData.byteLength} bytes) as audio/webm;codecs=opus`);
      
      // Add a small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 10));

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

  private async handleWebSocketMessage(data: string | Blob | ArrayBuffer): Promise<void> {
    try {
      let messageText: string;

      // Handle different data types
      if (typeof data === 'string') {
        messageText = data;
      } else if (data instanceof Blob) {
        // Convert Blob to text
        messageText = await data.text();
      } else if (data instanceof ArrayBuffer) {
        // Convert ArrayBuffer to text
        const decoder = new TextDecoder();
        messageText = decoder.decode(data);
      } else {
        console.warn('Received unknown message type from Gemini Live:', typeof data);
        return;
      }

      // Skip empty messages
      if (!messageText || messageText.trim() === '') {
        return;
      }

      // Parse JSON response
      const response: GeminiLiveResponse = JSON.parse(messageText);
      
      // Log all responses for debugging (but limit size for readability)
      const responseStr = JSON.stringify(response, null, 2);
      if (responseStr.length > 500) {
        console.log('📥 Received Gemini Live response (truncated):', responseStr.substring(0, 500) + '...');
      } else {
        console.log('📥 Received Gemini Live response:', responseStr);
      }

      // Handle setup complete
      if (response.setupComplete) {
        console.log('🔗 Gemini Live setup completed');
        return;
      }

      // Handle server content
      if (response.serverContent) {
        const serverContent = response.serverContent;
        console.log('📋 Server content received:', JSON.stringify(serverContent, null, 2));
        
        // Handle model turn (text response)
        if (serverContent.modelTurn && serverContent.modelTurn.parts) {
          console.log('🤖 Model turn detected with parts:', serverContent.modelTurn.parts);
          for (const part of serverContent.modelTurn.parts) {
            if (part.text && this.resultCallback) {
              console.log('📝 Calling result callback with model text:', part.text);
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
          console.log('🎤 Input transcription received:', serverContent.inputTranscription.text, 'finished:', serverContent.inputTranscription.finished);
          this.resultCallback({
            transcript: serverContent.inputTranscription.text,
            isFinal: serverContent.inputTranscription.finished || false,
            speakerTag: undefined,
            confidence: 1.0
          });
        }
        
        // Handle output transcription (if any)
        if (serverContent.outputTranscription && this.resultCallback) {
          console.log('🔊 Output transcription received:', serverContent.outputTranscription.text, 'finished:', serverContent.outputTranscription.finished);
          this.resultCallback({
            transcript: serverContent.outputTranscription.text,
            isFinal: serverContent.outputTranscription.finished || false,
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
      console.error('Raw data type:', typeof data);
      console.error('Raw data:', data);
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