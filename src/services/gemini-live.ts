import { DatabaseService } from './database';

// Add global error handler for unhandled crashes
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.error && event.error.stack && event.error.stack.includes('gemini-live')) {
      console.error('🚨 GEMINI LIVE CRASH DETECTED:', {
        message: event.error.message,
        stack: event.error.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString()
      });
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.stack && event.reason.stack.includes('gemini-live')) {
      console.error('🚨 GEMINI LIVE UNHANDLED REJECTION:', {
        reason: event.reason.message || event.reason,
        stack: event.reason.stack,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Add additional monitoring for any crashes
  console.log('🔍 GLOBAL: Gemini Live global error handlers installed');
}

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
  private audioStream: MediaStream | null = null;
  private resultCallback: ((result: GeminiLiveResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private _isStreaming = false;
  private _isAvailable = false;
  private apiKey: string | null = null;
  private audioChunksBuffer: Blob[] = [];
  private processingInterval: number | null = null;
  private audioAccumulationBuffer: Blob[] = [];
  private lastProcessTime = 0;
  private readonly ACCUMULATION_TIME_MS = 500;
  private audioContext: AudioContext | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private messageCount = 0;

  constructor() {
    this.checkAvailability();
  }

  private async checkAvailability() {
    try {
      // Check if we have the necessary APIs
      const hasWebSocket = typeof WebSocket !== 'undefined';
      const hasAudioContext = typeof AudioContext !== 'undefined';
      const hasGetUserMedia = !!(navigator.mediaDevices?.getUserMedia);

      // Get API key from various sources
      const electronAPI = (window as { electronAPI?: { env?: { GEMINI_API_KEY?: string } } }).electronAPI;
      const envApiKey = electronAPI?.env?.GEMINI_API_KEY;
      
      let settingsApiKey = null;
      try {
        const settings = await DatabaseService.getSettings();
        settingsApiKey = settings?.geminiApiKey;
      } catch (dbError) {
        console.warn('Could not access database for API key:', dbError);
      }
      
      const localStorageApiKey = localStorage.getItem('gemini-api-key');
      
      this.apiKey = envApiKey || settingsApiKey || localStorageApiKey;

      this._isAvailable = hasWebSocket && hasAudioContext && hasGetUserMedia && !!this.apiKey;

      if (!this._isAvailable) {
        console.warn('Gemini Live not available:', {
          hasWebSocket,
          hasAudioContext,
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
    console.log('🚀 GEMINI LIVE: Starting streaming with crash detection...');
    
    // Add a simple test mode flag
    const testMode = localStorage.getItem('gemini-live-test-mode') === 'true';
    if (testMode) {
      console.log('🧪 TEST MODE: Starting simplified Gemini Live test...');
      return this.startTestMode(options);
    }
    
    // Add comprehensive crash detection
    const crashDetector = {
      step: 'initialization',
      startTime: Date.now(),
      log: (step: string, data?: unknown) => {
        crashDetector.step = step;
        console.log(`🔍 GEMINI LIVE STEP [${step}]:`, data || '');
      },
      error: (step: string, error: Error | unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`🚨 GEMINI LIVE CRASH at [${step}]:`, {
          error: errorMessage,
          stack: errorStack,
          step,
          timeElapsed: Date.now() - crashDetector.startTime,
          timestamp: new Date().toISOString()
        });
      }
    };

    try {
      crashDetector.log('availability-check');
      if (!this._isAvailable) {
        throw new Error('Gemini Live service is not available');
      }

      crashDetector.log('streaming-check');
      if (this._isStreaming) {
        console.warn('Gemini Live streaming is already active');
        return;
      }

      crashDetector.log('api-key-check');
      if (!this.apiKey) {
        throw new Error('Gemini API key not configured. Please add your API key in settings.');
      }

      crashDetector.log('options-setup');
      // Default options
      const defaultOptions: Required<GeminiLiveOptions> = {
        sampleRateHertz: 16000,
        encoding: 'LINEAR16',
        enableSpeakerDiarization: true,
        maxSpeakerCount: 4,
        languageCode: 'en-US',
        ...options
      };

      crashDetector.log('microphone-capture-start', defaultOptions);
      // Start microphone capture
      await this.startMicrophoneCapture(defaultOptions);

      // Add a small delay to ensure audio processing is fully initialized
      console.log('⏱️ Adding delay before WebSocket connection...');
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('⏱️ Delay completed, proceeding with WebSocket connection');

      crashDetector.log('websocket-connect-start');
      // Connect to Gemini Live WebSocket
      await this.connectWebSocket(defaultOptions);

      crashDetector.log('streaming-state-update');
      this._isStreaming = true;
      
      crashDetector.log('success', { timeElapsed: Date.now() - crashDetector.startTime });
      console.log('✅ Gemini Live streaming started successfully');

      // Add immediate post-startup monitoring
      console.log('🔍 POST-STARTUP: Service initialized successfully, starting monitoring...');
      
      // Check service state every 500ms for the first 10 seconds
      let monitoringCount = 0;
      const monitoringInterval = setInterval(() => {
        monitoringCount++;
        console.log(`🔍 POST-STARTUP MONITOR #${monitoringCount}:`, {
          isStreaming: this._isStreaming,
          websocketState: this.websocket?.readyState,
          audioContextState: this.audioContext?.state,
          processingIntervalActive: !!this.processingInterval,
          timestamp: new Date().toISOString()
        });
        
        // Stop monitoring after 20 checks (10 seconds)
        if (monitoringCount >= 20) {
          clearInterval(monitoringInterval);
          console.log('🔍 POST-STARTUP: Monitoring completed - service appears stable');
        }
      }, 500);
    } catch (error) {
      crashDetector.error(crashDetector.step, error);
      console.error('❌ Failed to start Gemini Live streaming:', error);
      
      // Enhanced cleanup with crash detection
      try {
        crashDetector.log('cleanup-after-error');
        this.cleanup();
      } catch (cleanupError) {
        console.error('🚨 CLEANUP CRASH:', cleanupError);
      }
      
      throw error;
    }
  }

  private async startMicrophoneCapture(options: Required<GeminiLiveOptions>): Promise<void> {
    try {
      console.log('🎤 Starting microphone capture for Gemini Live...');
      
      // Check if microphone access is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not available in this browser');
      }

      // Get microphone access with 16kHz sample rate to match Gemini Live API requirements
      console.log('🎤 Requesting microphone permission...');
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000, // Fixed to 16kHz for Gemini Live API compatibility
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ Microphone access granted');

      // Check if AudioContext is available
      if (typeof AudioContext === 'undefined') {
        throw new Error('AudioContext not available in this browser');
      }

      // Instead of using MediaRecorder, use Web Audio API to capture raw PCM data directly
      // This eliminates the need for WebM-to-PCM conversion
      console.log('🎤 Creating AudioContext...');
      const audioContext = new AudioContext({
        sampleRate: 16000 // Match Gemini Live API requirements
      });

      // Check if AudioContext was created successfully
      if (!audioContext) {
        throw new Error('Failed to create AudioContext');
      }

      console.log('✅ AudioContext created successfully');

      const source = audioContext.createMediaStreamSource(this.audioStream);
      
      // Create a ScriptProcessorNode to capture raw audio data
      // Note: ScriptProcessorNode is deprecated but still widely supported
      // We'll use it for now as AudioWorklet requires more complex setup
      const bufferSize = 4096; // Process in 4KB chunks
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      let audioEventCount = 0;
      
      processor.onaudioprocess = (event) => {
        try {
          audioEventCount++;
          
          // Log more frequently at the beginning, then reduce frequency
          const shouldLog = audioEventCount <= 10 || audioEventCount % 100 === 1;
          
          if (shouldLog) {
            console.log(`🎤 Audio processing event #${audioEventCount} triggered`);
          }
          
          const inputBuffer = event.inputBuffer;
          if (!inputBuffer) {
            if (shouldLog) {
              console.warn('⚠️ No input buffer in audio event');
            }
            return;
          }
          
          const inputData = inputBuffer.getChannelData(0); // Get mono channel (Float32Array)
          
          if (!inputData || inputData.length === 0) {
            if (shouldLog) {
              console.warn('⚠️ No input data or empty input data');
            }
            return;
          }
          
          // Check for actual audio activity (not just silence)
          const audioLevel = this.calculateAudioLevel(inputData);
          const hasAudioActivity = audioLevel > 0.001; // Threshold for detecting actual audio
          
          if (shouldLog) {
            console.log(`🎤 Processing ${inputData.length} audio samples, level: ${audioLevel.toFixed(6)}, hasActivity: ${hasAudioActivity}`);
          }
          
          // Convert Float32Array to 16-bit PCM
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }
          
          // Add PCM data directly to accumulation buffer
          const pcmBlob = new Blob([pcmData.buffer]);
          this.audioAccumulationBuffer.push(pcmBlob);
          
          if (shouldLog) {
            console.log(`🎤 Raw PCM chunk captured: ${pcmData.byteLength} bytes, buffer size: ${this.audioAccumulationBuffer.length}, audioLevel: ${audioLevel.toFixed(6)}`);
          }
        } catch (processingError) {
          console.error(`🚨 CRASH in audio processing event #${audioEventCount}:`, {
            error: processingError.message,
            stack: processingError.stack,
            timestamp: new Date().toISOString()
          });
          
          // Try to continue processing despite the error
          if (this.errorCallback) {
            this.errorCallback(new Error(`Audio processing error: ${processingError.message}`));
          }
        }
      };
      
      // Connect the audio processing chain
      try {
        source.connect(processor);
        processor.connect(audioContext.destination);
        console.log('✅ Audio processing chain connected');
      } catch (connectionError) {
        console.error('Error connecting audio processing chain:', connectionError);
        throw new Error(`Failed to connect audio processing chain: ${connectionError.message}`);
      }
      
      // Store references for cleanup
      this.audioContext = audioContext;
      this.audioProcessor = processor;

      console.log('🎤 Direct PCM capture started at 16kHz for Gemini Live API');
      console.log('🎤 AudioContext sample rate:', audioContext.sampleRate);
      
      // Add immediate audio processing test
      console.log('🎤 Testing audio processing pipeline...');
      let audioTestPassed = false;
      try {
        // Test if the audio processing chain is working
        if (this.audioAccumulationBuffer && Array.isArray(this.audioAccumulationBuffer)) {
          console.log('🎤 Audio accumulation buffer is ready');
          audioTestPassed = true;
        } else {
          console.warn('⚠️ Audio accumulation buffer is not properly initialized');
        }
      } catch (audioTestError) {
        console.error('🚨 Audio processing test failed:', audioTestError);
      }
      
      console.log('🎤 Audio processing test result:', audioTestPassed ? 'PASSED' : 'FAILED');
      
      // Add diagnostic check for audio processing events
      setTimeout(() => {
        console.log('🔍 AUDIO DIAGNOSTIC: Checking if audio events are being triggered...');
        console.log('🔍 AUDIO DIAGNOSTIC: Audio event count so far:', audioEventCount);
        console.log('🔍 AUDIO DIAGNOSTIC: Audio context state:', audioContext.state);
        console.log('🔍 AUDIO DIAGNOSTIC: Audio stream tracks:', this.audioStream?.getTracks().length || 0);
        
        if (this.audioStream) {
          this.audioStream.getTracks().forEach((track, index) => {
            console.log(`🔍 AUDIO DIAGNOSTIC: Track ${index}:`, {
              kind: track.kind,
              enabled: track.enabled,
              readyState: track.readyState,
              muted: track.muted
            });
          });
        }
        
        if (audioEventCount === 0) {
          console.warn('⚠️ AUDIO DIAGNOSTIC: No audio events triggered yet - this may indicate an issue with the audio processing chain');
        } else {
          console.log('✅ AUDIO DIAGNOSTIC: Audio events are being triggered successfully');
        }
      }, 3000);
      
    } catch (error) {
      console.error('Failed to start microphone capture:', error);
      
      // Clean up any partially created resources
      this.cleanup();
      
      // Provide more specific error messages
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied. Please allow microphone access and try again.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Microphone access not supported in this browser.');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Microphone is already in use by another application.');
      } else {
        throw new Error(`Microphone access failed: ${error.message}`);
      }
    }
  }

  private async connectWebSocket(options: Required<GeminiLiveOptions>): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔗 Connecting to Gemini Live WebSocket...');
        
        // Check WebSocket availability
        if (typeof WebSocket === 'undefined') {
          reject(new Error('WebSocket is not available in this environment'));
          return;
        }
        console.log('🔗 WebSocket constructor is available');
        
        if (!this.apiKey) {
          reject(new Error('API key is required for WebSocket connection'));
          return;
        }
        console.log('🔗 API key is available');

        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        console.log('🔗 WebSocket URL:', wsUrl.replace(this.apiKey, '[API_KEY_HIDDEN]'));
        
        console.log('🔗 Creating WebSocket instance...');
        try {
          this.websocket = new WebSocket(wsUrl);
          console.log('🔗 WebSocket instance created successfully');
          console.log('🔗 WebSocket readyState:', this.websocket.readyState);
          console.log('🔗 WebSocket URL property:', this.websocket.url ? this.websocket.url.replace(this.apiKey, '[API_KEY_HIDDEN]') : 'undefined');
        } catch (wsCreationError) {
          console.error('🚨 CRASH during WebSocket creation:', {
            error: wsCreationError.message,
            stack: wsCreationError.stack,
            url: wsUrl.replace(this.apiKey, '[API_KEY_HIDDEN]'),
            timestamp: new Date().toISOString()
          });
          reject(new Error(`Failed to create WebSocket: ${wsCreationError.message}`));
          return;
        }

        console.log('🔗 Setting up connection timeout...');
        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          console.log('🔗 Connection timeout triggered');
          if (this.websocket && this.websocket.readyState === WebSocket.CONNECTING) {
            console.error('❌ WebSocket connection timeout');
            this.websocket.close();
            reject(new Error('Connection timeout - please check your internet connection and API key'));
          }
        }, 10000); // 10 second timeout

        console.log('🔗 Setting up WebSocket event handlers...');
        
        try {
          console.log('🔗 Setting up onopen handler...');
          this.websocket.onopen = () => {
            try {
              console.log('🔗 WebSocket onopen event triggered');
              console.log('🔗 Gemini Live WebSocket connected');
              clearTimeout(connectionTimeout);
              
              console.log('🔗 Sending initial configuration...');
              // Send initial configuration
              this.sendInitialConfig(options);
              console.log('🔗 Initial configuration sent successfully');
              
              console.log('🔗 Starting audio processing...');
              // Start processing audio chunks
              this.startAudioProcessing();
              console.log('🔗 Audio processing started successfully');
              
              console.log('🔗 WebSocket setup complete, resolving promise');
              resolve();
              
              // Add immediate post-startup monitoring
              console.log('🔍 POST-STARTUP: Service initialized successfully, starting monitoring...');
              
              // Check service state every 500ms for the first 10 seconds
              let monitoringCount = 0;
              const monitoringInterval = setInterval(() => {
                monitoringCount++;
                console.log(`🔍 POST-STARTUP MONITOR #${monitoringCount}:`, {
                  isStreaming: this._isStreaming,
                  websocketState: this.websocket?.readyState,
                  audioContextState: this.audioContext?.state,
                  processingIntervalActive: !!this.processingInterval,
                  timestamp: new Date().toISOString()
                });
                
                // Stop monitoring after 20 checks (10 seconds)
                if (monitoringCount >= 20) {
                  clearInterval(monitoringInterval);
                  console.log('🔍 POST-STARTUP: Monitoring completed - service appears stable');
                }
              }, 500);
            } catch (setupError) {
              console.error('🚨 CRASH in WebSocket onopen handler:', {
                error: setupError.message,
                stack: setupError.stack,
                timestamp: new Date().toISOString()
              });
              clearTimeout(connectionTimeout);
              reject(new Error(`WebSocket setup failed: ${setupError.message}`));
            }
          };
          console.log('🔗 ✅ onopen handler set successfully');
        } catch (onopenError) {
          console.error('🚨 CRASH setting onopen handler:', {
            error: onopenError.message,
            stack: onopenError.stack,
            timestamp: new Date().toISOString()
          });
          reject(new Error(`Failed to set onopen handler: ${onopenError.message}`));
          return;
        }

        try {
          console.log('🔗 Setting up onmessage handler...');
          this.websocket.onmessage = async (event) => {
            try {
              console.log('📥 WebSocket onmessage event triggered, data type:', typeof event.data);
              console.log('📥 Message data size:', event.data instanceof Blob ? event.data.size : event.data instanceof ArrayBuffer ? event.data.byteLength : event.data.length);
              
              // Add a simple message counter
              if (!this.messageCount) {
                this.messageCount = 0;
              }
              this.messageCount++;
              console.log(`📥 Processing message #${this.messageCount}`);
              
              await this.handleWebSocketMessage(event.data);
              console.log(`📥 Message #${this.messageCount} handled successfully`);
            } catch (messageError) {
              console.error('🚨 CRASH in WebSocket onmessage handler:', {
                error: messageError.message,
                stack: messageError.stack,
                dataType: typeof event.data,
                timestamp: new Date().toISOString()
              });
              // Don't reject here, just log the error to avoid crashing the connection
              if (this.errorCallback) {
                this.errorCallback(new Error(`WebSocket message handling error: ${messageError.message}`));
              }
            }
          };
          console.log('🔗 ✅ onmessage handler set successfully');
        } catch (onmessageError) {
          console.error('🚨 CRASH setting onmessage handler:', {
            error: onmessageError.message,
            stack: onmessageError.stack,
            timestamp: new Date().toISOString()
          });
          reject(new Error(`Failed to set onmessage handler: ${onmessageError.message}`));
          return;
        }

        try {
          console.log('🔗 Setting up onerror handler...');
          this.websocket.onerror = (error) => {
            try {
              console.error('🚨 WebSocket onerror event triggered:', error);
              console.error('❌ WebSocket error:', error);
              clearTimeout(connectionTimeout);
              
              // Provide more specific error messages
              if (this.websocket?.readyState === WebSocket.CONNECTING) {
                reject(new Error('Failed to connect to Gemini Live. Please check your API key and internet connection.'));
              } else {
                reject(new Error('WebSocket connection error occurred'));
              }
            } catch (errorHandlerError) {
              console.error('🚨 CRASH in WebSocket onerror handler:', {
                error: errorHandlerError.message,
                stack: errorHandlerError.stack,
                originalError: error,
                timestamp: new Date().toISOString()
              });
              reject(new Error(`WebSocket error handler failed: ${errorHandlerError.message}`));
            }
          };
          console.log('🔗 ✅ onerror handler set successfully');
        } catch (onerrorError) {
          console.error('🚨 CRASH setting onerror handler:', {
            error: onerrorError.message,
            stack: onerrorError.stack,
            timestamp: new Date().toISOString()
          });
          reject(new Error(`Failed to set onerror handler: ${onerrorError.message}`));
          return;
        }

        try {
          console.log('🔗 Setting up onclose handler...');
          this.websocket.onclose = (event) => {
            console.log('🔌 Gemini Live WebSocket closed:', event.code, event.reason);
            clearTimeout(connectionTimeout);
            
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
                case 4001:
                  errorMessage = 'Invalid API key for Gemini Live';
                  break;
                case 4003:
                  errorMessage = 'API quota exceeded for Gemini Live';
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
          console.log('🔗 ✅ onclose handler set successfully');
        } catch (oncloseError) {
          console.error('🚨 CRASH setting onclose handler:', {
            error: oncloseError.message,
            stack: oncloseError.stack,
            timestamp: new Date().toISOString()
          });
          reject(new Error(`Failed to set onclose handler: ${oncloseError.message}`));
          return;
        }

        console.log('🔗 ✅ All WebSocket event handlers set successfully');

        // Validate WebSocket state after setting handlers
        try {
          console.log('🔗 Validating WebSocket state after handler setup...');
          if (!this.websocket) {
            throw new Error('WebSocket instance became null after handler setup');
          }
          
          console.log('🔗 WebSocket validation:', {
            readyState: this.websocket.readyState,
            readyStateText: this.getReadyStateText(this.websocket.readyState),
            url: this.websocket.url ? this.websocket.url.replace(this.apiKey, '[API_KEY_HIDDEN]') : 'undefined'
          });
          
          if (this.websocket.readyState === WebSocket.CLOSED) {
            throw new Error('WebSocket closed immediately after creation');
          }
          
          console.log('🔗 ✅ WebSocket state validation passed');
        } catch (validationError) {
          console.error('🚨 CRASH during WebSocket validation:', {
            error: validationError.message,
            stack: validationError.stack,
            timestamp: new Date().toISOString()
          });
          reject(new Error(`WebSocket validation failed: ${validationError.message}`));
          return;
        }

        console.log('🔗 ✅ WebSocket connection setup completed successfully');

        // Add diagnostic check for WebSocket messages
        setTimeout(() => {
          console.log('🔍 WEBSOCKET DIAGNOSTIC: Checking WebSocket message activity...');
          console.log('🔍 WEBSOCKET DIAGNOSTIC: Total messages received:', this.messageCount || 0);
          console.log('🔍 WEBSOCKET DIAGNOSTIC: WebSocket state:', this.websocket?.readyState, this.getReadyStateText(this.websocket?.readyState || -1));
          
          if ((this.messageCount || 0) <= 1) {
            console.warn('⚠️ WEBSOCKET DIAGNOSTIC: Only setup message received - no subsequent API responses');
            console.warn('⚠️ This may indicate the API is not responding to audio input or there\'s an issue with audio transmission');
          } else {
            console.log('✅ WEBSOCKET DIAGNOSTIC: WebSocket is receiving messages from the API');
          }
        }, 5000);

      } catch (error) {
        console.error('❌ Error creating WebSocket:', error);
        reject(new Error(`Failed to create WebSocket connection: ${error.message}`));
      }
    });
  }

  private sendInitialConfig(options: Required<GeminiLiveOptions>): void {
    try {
      console.log('📤 sendInitialConfig called');
      
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        console.warn('⚠️ WebSocket not ready for initial config');
        return;
      }

      console.log('📤 Creating setup message...');
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

      console.log('📤 Setup message created:', JSON.stringify(setupMessage, null, 2));
      console.log('📤 Sending setup message to WebSocket...');
      
      this.websocket.send(JSON.stringify(setupMessage));
      console.log('📤 Sent initial setup to Gemini Live API with corrected format');
    } catch (configError) {
      console.error('🚨 CRASH in sendInitialConfig:', {
        error: configError.message,
        stack: configError.stack,
        websocketState: this.websocket?.readyState || 'null',
        timestamp: new Date().toISOString()
      });
      
      // Re-throw the error so the calling function can handle it
      throw new Error(`Initial config failed: ${configError.message}`);
    }
  }

  private startAudioProcessing(): void {
    try {
      console.log('🎵 Starting audio processing interval...');
      
      // Validate prerequisites
      if (!this.audioAccumulationBuffer) {
        throw new Error('Audio accumulation buffer not initialized');
      }
      
      if (!this.audioChunksBuffer) {
        throw new Error('Audio chunks buffer not initialized');
      }
      
      console.log('🎵 Audio processing prerequisites validated');
      
      let intervalCount = 0;
      
      console.log('🎵 Setting up audio processing interval...');
      // Process accumulated audio chunks every 100ms, but only send when enough time has passed
      this.processingInterval = window.setInterval(() => {
        try {
          intervalCount++;
          
          // Only log every 10th interval to reduce spam, but always log the first few
          if (intervalCount <= 5 || intervalCount % 10 === 0) {
            console.log(`🎵 Audio processing interval #${intervalCount} triggered`);
            console.log(`🎵 Current audio buffer state: accumulation=${this.audioAccumulationBuffer.length}, processing=${this.audioChunksBuffer.length}`);
          }
          
          this.checkAndProcessAccumulatedAudio();
          
          // Only log completion for first few intervals or every 10th
          if (intervalCount <= 5 || intervalCount % 10 === 0) {
            console.log(`🎵 Audio processing interval #${intervalCount} completed successfully`);
          }
        } catch (intervalError) {
          console.error(`🚨 CRASH in audio processing interval #${intervalCount}:`, {
            error: intervalError.message,
            stack: intervalError.stack,
            timestamp: new Date().toISOString()
          });
          
          // Try to continue processing despite the error
          if (this.errorCallback) {
            this.errorCallback(new Error(`Audio processing interval error: ${intervalError.message}`));
          }
        }
      }, 100);
      
      console.log('🎵 ✅ Audio processing interval set successfully');
      
      console.log('🎵 Starting connection health monitoring...');
      // Add connection health monitoring
      this.startConnectionHealthCheck();
      console.log('🎵 ✅ Connection health monitoring started');
      
      console.log('🎵 ✅ Audio processing setup completed successfully');
      
      // Add immediate diagnostic check
      setTimeout(() => {
        console.log('🔍 DIAGNOSTIC: Checking audio processing state after 2 seconds...');
        console.log('🔍 DIAGNOSTIC: Processing interval active:', !!this.processingInterval);
        console.log('🔍 DIAGNOSTIC: Audio context state:', this.audioContext?.state);
        console.log('🔍 DIAGNOSTIC: Audio processor connected:', !!this.audioProcessor);
        console.log('🔍 DIAGNOSTIC: Audio stream active:', !!this.audioStream);
        console.log('🔍 DIAGNOSTIC: Audio accumulation buffer size:', this.audioAccumulationBuffer?.length || 0);
        console.log('🔍 DIAGNOSTIC: WebSocket state:', this.websocket?.readyState, this.getReadyStateText(this.websocket?.readyState || -1));
        console.log('🔍 DIAGNOSTIC: Is streaming:', this._isStreaming);
        
        // Test if the interval is actually running
        let testIntervalCount = 0;
        const testInterval = setInterval(() => {
          testIntervalCount++;
          console.log(`🔍 DIAGNOSTIC: Test interval #${testIntervalCount} - intervals are working`);
          if (testIntervalCount >= 3) {
            clearInterval(testInterval);
            console.log('🔍 DIAGNOSTIC: Test interval completed - intervals are functional');
          }
        }, 500);
      }, 2000);
    } catch (audioProcessingError) {
      console.error('🚨 CRASH in startAudioProcessing:', {
        error: audioProcessingError.message,
        stack: audioProcessingError.stack,
        timestamp: new Date().toISOString()
      });
      
      // Re-throw the error so the calling function can handle it
      throw new Error(`Audio processing setup failed: ${audioProcessingError.message}`);
    }
  }

  private checkAndProcessAccumulatedAudio(): void {
    try {
      const now = Date.now();
      const timeSinceLastProcess = now - this.lastProcessTime;
      
      // Log buffer state and timing every few checks
      const shouldLogDetails = this.audioAccumulationBuffer.length > 0 || timeSinceLastProcess > this.ACCUMULATION_TIME_MS;
      
      if (shouldLogDetails) {
        console.log(`🎵 Checking accumulated audio: ${this.audioAccumulationBuffer.length} chunks, last process: ${timeSinceLastProcess}ms ago (threshold: ${this.ACCUMULATION_TIME_MS}ms)`);
      }
      
      // Only process if we have chunks and enough time has passed since last processing
      if (this.audioAccumulationBuffer.length > 0 && 
          timeSinceLastProcess >= this.ACCUMULATION_TIME_MS) {
        
        console.log(`🎵 ✅ PROCESSING ${this.audioAccumulationBuffer.length} accumulated chunks (${timeSinceLastProcess}ms since last process)`);
        
        // Move accumulated chunks to processing buffer
        this.audioChunksBuffer = [...this.audioAccumulationBuffer];
        this.audioAccumulationBuffer = [];
        this.lastProcessTime = now;
        
        // Process the accumulated chunks
        this.processAudioChunks();
      } else if (this.audioAccumulationBuffer.length === 0) {
        // Only log this occasionally to avoid spam
        if (Math.random() < 0.01) { // 1% chance to log
          console.log('🎵 No audio chunks to process');
        }
      } else {
        // Log when we're waiting for more time to pass
        if (shouldLogDetails) {
          console.log(`🎵 Waiting for accumulation time (${timeSinceLastProcess}ms < ${this.ACCUMULATION_TIME_MS}ms)`);
        }
      }
    } catch (checkError) {
      console.error('🚨 CRASH in checkAndProcessAccumulatedAudio:', {
        error: checkError.message,
        stack: checkError.stack,
        timestamp: new Date().toISOString(),
        bufferLength: this.audioAccumulationBuffer?.length || 0
      });
      
      // Try to continue processing despite the error
      if (this.errorCallback) {
        this.errorCallback(new Error(`Audio accumulation check error: ${checkError.message}`));
      }
    }
  }

  private startConnectionHealthCheck(): void {
    try {
      console.log('🔍 Setting up connection health check...');
      
      // Check connection health every 5 seconds
      const healthCheckInterval = setInterval(() => {
        try {
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
          
          // Memory usage monitoring
          if (typeof performance !== 'undefined' && 'memory' in performance) {
            const memory = (performance as { memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
            const memInfo = {
              usedJSHeapSize: Math.round(memory.usedJSHeapSize / 1024 / 1024),
              totalJSHeapSize: Math.round(memory.totalJSHeapSize / 1024 / 1024),
              jsHeapSizeLimit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
              audioBufferLength: this.audioAccumulationBuffer?.length || 0,
              processingBufferLength: this.audioChunksBuffer?.length || 0
            };
            
            console.log('💾 Memory usage:', memInfo);
            
            // Warn if memory usage is getting high
            if (memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.8) {
              console.warn('⚠️ High memory usage detected! This could cause crashes.');
            }
            
            // Warn if audio buffers are getting too large
            if (memInfo.audioBufferLength > 100) {
              console.warn('⚠️ Audio accumulation buffer is getting large:', memInfo.audioBufferLength);
            }
            
            if (memInfo.processingBufferLength > 50) {
              console.warn('⚠️ Audio processing buffer is getting large:', memInfo.processingBufferLength);
            }
          }
          
          // Clean up if not streaming
          if (!this._isStreaming) {
            clearInterval(healthCheckInterval);
          }
        } catch (healthCheckError) {
          console.error('🚨 Error in health check:', healthCheckError);
        }
      }, 5000);
      
      console.log('🔍 ✅ Connection health check setup completed');
    } catch (healthCheckSetupError) {
      console.error('🚨 CRASH in startConnectionHealthCheck:', {
        error: healthCheckSetupError.message,
        stack: healthCheckSetupError.stack,
        timestamp: new Date().toISOString()
      });
      
      // Don't re-throw this error as health check is not critical
      console.warn('⚠️ Health check setup failed, continuing without health monitoring');
    }
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

  private calculateAudioLevel(audioData: Float32Array): number {
    // Calculate RMS (Root Mean Square) to get audio level
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  private async processAudioChunks(): Promise<void> {
    console.log('🎵 processAudioChunks called');
    
    if (this.audioChunksBuffer.length === 0 || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.log('🎵 Skipping audio processing - no chunks or websocket not ready');
      return;
    }

    try {
      console.log('🎵 Starting audio chunk processing...');
      
      // Get all pending chunks
      const chunks = [...this.audioChunksBuffer];
      this.audioChunksBuffer = [];

      console.log(`🎵 Processing ${chunks.length} accumulated PCM chunks, total size: ${chunks.reduce((sum, chunk) => sum + chunk.size, 0)} bytes`);

      // Convert accumulated PCM chunks to a single ArrayBuffer
      // Since we're now capturing raw PCM data, no conversion is needed
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
      console.log(`🎵 Creating combined buffer of size: ${totalSize}`);
      
      const combinedBuffer = new ArrayBuffer(totalSize);
      const combinedView = new Uint8Array(combinedBuffer);
      
      console.log('🎵 Combining chunks into single buffer...');
      let offset = 0;
      for (let i = 0; i < chunks.length; i++) {
        try {
          const chunk = chunks[i];
          console.log(`🎵 Processing chunk ${i + 1}/${chunks.length}, size: ${chunk.size}`);
          
          const chunkBuffer = await chunk.arrayBuffer();
          const chunkView = new Uint8Array(chunkBuffer);
          combinedView.set(chunkView, offset);
          offset += chunkView.length;
          
          console.log(`🎵 Chunk ${i + 1} processed, offset now: ${offset}`);
        } catch (chunkError) {
          console.error(`🚨 Error processing chunk ${i + 1}:`, chunkError);
          // Continue with other chunks
        }
      }
      
      console.log('🎵 Converting to base64...');
      // Convert PCM data to base64 as required by Live API
      const base64Audio = this.arrayBufferToBase64(combinedBuffer);
      console.log(`🎵 Base64 conversion complete: ${base64Audio.length} characters`);

      // Send realtime input to Gemini Live API using PCM format
      const message = {
        realtimeInput: {
          audio: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000"
          }
        }
      };

      console.log('🎵 Sending audio message to WebSocket...');
      this.websocket.send(JSON.stringify(message));
      console.log(`📤 Sent raw PCM audio chunk: ${base64Audio.length} characters (${combinedBuffer.byteLength} bytes) as audio/pcm;rate=16000`);
      console.log(`📤 WebSocket readyState after send: ${this.websocket.readyState} (${this.getReadyStateText(this.websocket.readyState)})`);
      
      // Add a small delay to avoid overwhelming the API
      console.log('🎵 Adding processing delay...');
      await new Promise(resolve => setTimeout(resolve, 10));
      console.log('🎵 Audio chunk processing complete');

    } catch (error) {
      console.error('🚨 CRASH in processAudioChunks:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        chunksLength: this.audioChunksBuffer?.length || 0,
        websocketState: this.websocket?.readyState || 'null'
      });
      
      // If processing fails, we'll try again with the next batch
      if (this.errorCallback) {
        this.errorCallback(new Error(`Audio chunk processing error: ${error.message}`));
      }
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    try {
      console.log(`🔄 Converting ArrayBuffer to base64: ${buffer.byteLength} bytes`);
      
      const bytes = new Uint8Array(buffer);
      console.log(`🔄 Created Uint8Array with ${bytes.byteLength} bytes`);
      
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      
      console.log(`🔄 Created binary string: ${binary.length} characters`);
      
      const result = btoa(binary);
      console.log(`🔄 Base64 conversion complete: ${result.length} characters`);
      
      return result;
    } catch (conversionError) {
      console.error('🚨 CRASH in arrayBufferToBase64:', {
        error: conversionError.message,
        stack: conversionError.stack,
        bufferSize: buffer?.byteLength || 0,
        timestamp: new Date().toISOString()
      });
      
      // Return empty string to prevent further crashes
      return '';
    }
  }

  private async handleWebSocketMessage(data: string | Blob | ArrayBuffer): Promise<void> {
    try {
      console.log('📥 handleWebSocketMessage called, data type:', typeof data);
      
      let messageText: string;

      console.log('📥 Converting message data to text...');
      // Handle different data types
      if (typeof data === 'string') {
        messageText = data;
        console.log('📥 Data is already string, length:', data.length);
      } else if (data instanceof Blob) {
        console.log('📥 Converting Blob to text, size:', data.size);
        // Convert Blob to text
        messageText = await data.text();
        console.log('📥 Blob converted to text, length:', messageText.length);
      } else if (data instanceof ArrayBuffer) {
        console.log('📥 Converting ArrayBuffer to text, byteLength:', data.byteLength);
        // Convert ArrayBuffer to text
        const decoder = new TextDecoder();
        messageText = decoder.decode(data);
        console.log('📥 ArrayBuffer converted to text, length:', messageText.length);
      } else {
        console.warn('📥 Received unknown message type from Gemini Live:', typeof data);
        return;
      }

      // Skip empty messages
      if (!messageText || messageText.trim() === '') {
        console.log('📥 Skipping empty message');
        return;
      }

      console.log('📥 Parsing JSON response...');
      // Parse JSON response
      const response: GeminiLiveResponse = JSON.parse(messageText);
      console.log('📥 JSON parsed successfully');
      
      // Log all responses for debugging (but limit size for readability)
      const responseStr = JSON.stringify(response, null, 2);
      if (responseStr.length > 500) {
        console.log('📥 Received Gemini Live response (truncated):', responseStr.substring(0, 500) + '...');
      } else {
        console.log('📥 Received Gemini Live response:', responseStr);
      }

      console.log('📥 Processing response content...');
      // Handle setup complete
      if (response.setupComplete) {
        console.log('🔗 Gemini Live setup completed');
        console.log('🔗 Setup completion received - API is ready for audio input');
        return;
      }

      // Handle server content
      if (response.serverContent) {
        console.log('📥 Processing server content...');
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
        console.error('📥 Gemini Live API error received:', response.error);
        if (this.errorCallback) {
          this.errorCallback(new Error(response.error.message || 'Unknown error'));
        }
        return;
      }

      console.log('📥 Message processing completed successfully');

    } catch (error) {
      console.error('🚨 CRASH in handleWebSocketMessage:', {
        error: error.message,
        stack: error.stack,
        dataType: typeof data,
        dataSize: data instanceof Blob ? data.size : data instanceof ArrayBuffer ? data.byteLength : typeof data === 'string' ? data.length : 'unknown',
        timestamp: new Date().toISOString()
      });
      
      console.error('📥 Raw data type:', typeof data);
      console.error('📥 Raw data (first 200 chars):', typeof data === 'string' ? data.substring(0, 200) : 'Non-string data');
      
      // Don't re-throw the error to avoid crashing the WebSocket connection
      if (this.errorCallback) {
        this.errorCallback(new Error(`Message handling error: ${error.message}`));
      }
    }
  }

  // Simplified test mode for debugging
  private async startTestMode(options: GeminiLiveOptions = {}): Promise<void> {
    console.log('🧪 TEST MODE: Starting simplified WebSocket test...');
    
    try {
      if (!this._isAvailable) {
        throw new Error('Gemini Live service is not available');
      }

      if (!this.apiKey) {
        throw new Error('Gemini API key not configured');
      }

      console.log('🧪 TEST MODE: Creating WebSocket connection...');
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
      
      this.websocket = new WebSocket(wsUrl);
      
      return new Promise((resolve, reject) => {
        if (!this.websocket) {
          reject(new Error('Failed to create WebSocket'));
          return;
        }

        this.websocket.onopen = () => {
          console.log('🧪 TEST MODE: WebSocket connected');
          
          // Send simple setup message
          const setupMessage = {
            setup: {
              model: "models/gemini-2.0-flash-live-001",
              generationConfig: {
                responseModalities: ["TEXT"]
              }
            }
          };
          
          console.log('🧪 TEST MODE: Sending setup message...');
          this.websocket!.send(JSON.stringify(setupMessage));
          
          this._isStreaming = true;
          console.log('🧪 TEST MODE: Setup complete');
          resolve();
        };

        this.websocket.onmessage = (event) => {
          console.log('🧪 TEST MODE: Received message:', event.data);
          
          try {
            const response = JSON.parse(event.data);
            if (response.setupComplete) {
              console.log('🧪 TEST MODE: Setup completed by API');
            }
            if (response.error) {
              console.error('🧪 TEST MODE: API error:', response.error);
            }
          } catch (parseError) {
            console.warn('🧪 TEST MODE: Could not parse message:', parseError);
          }
        };

        this.websocket.onerror = (error) => {
          console.error('🧪 TEST MODE: WebSocket error:', error);
          reject(new Error('WebSocket connection failed'));
        };

        this.websocket.onclose = (event) => {
          console.log('🧪 TEST MODE: WebSocket closed:', event.code, event.reason);
          this._isStreaming = false;
        };

        // Set timeout
        setTimeout(() => {
          if (this.websocket?.readyState === WebSocket.CONNECTING) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      });
      
    } catch (error) {
      console.error('🧪 TEST MODE: Error:', error);
      throw error;
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
    console.log('🧹 Starting Gemini Live cleanup...');
    
    try {
      // Clear audio buffers
      this.audioChunksBuffer = [];
      this.audioAccumulationBuffer = [];
      
      // Stop audio processing
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
        console.log('✅ Audio processing interval cleared');
      }

      // Clean up Web Audio API resources
      if (this.audioProcessor) {
        try {
          this.audioProcessor.disconnect();
          this.audioProcessor = null;
          console.log('✅ Audio processor disconnected');
        } catch (processorError) {
          console.warn('Warning: Error disconnecting audio processor:', processorError);
        }
      }
      
      if (this.audioContext) {
        try {
          // Check if context is not already closed
          if (this.audioContext.state !== 'closed') {
            this.audioContext.close();
            console.log('✅ AudioContext closed');
          }
          this.audioContext = null;
        } catch (contextError) {
          console.warn('Warning: Error closing AudioContext:', contextError);
        }
      }

      // Stop audio stream
      if (this.audioStream) {
        try {
          this.audioStream.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (trackError) {
              console.warn('Warning: Error stopping audio track:', trackError);
            }
          });
          this.audioStream = null;
          console.log('✅ Audio stream stopped');
        } catch (streamError) {
          console.warn('Warning: Error stopping audio stream:', streamError);
        }
      }

      // Close WebSocket
      if (this.websocket) {
        try {
          if (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING) {
            this.websocket.close();
            console.log('✅ WebSocket closed');
          }
          this.websocket = null;
        } catch (wsError) {
          console.warn('Warning: Error closing WebSocket:', wsError);
        }
      }

      console.log('🧹 Gemini Live cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      // Continue cleanup even if there are errors
    }
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