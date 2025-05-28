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

      crashDetector.log('websocket-connect-start');
      // Connect to Gemini Live WebSocket
      await this.connectWebSocket(defaultOptions);

      crashDetector.log('streaming-state-update');
      this._isStreaming = true;
      
      crashDetector.log('success', { timeElapsed: Date.now() - crashDetector.startTime });
      console.log('✅ Gemini Live streaming started successfully');
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
      
      processor.onaudioprocess = (event) => {
        try {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0); // Get mono channel (Float32Array)
          
          // Convert Float32Array to 16-bit PCM
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }
          
          // Add PCM data directly to accumulation buffer
          const pcmBlob = new Blob([pcmData.buffer]);
          this.audioAccumulationBuffer.push(pcmBlob);
          
          console.log(`🎤 Raw PCM chunk captured: ${pcmData.byteLength} bytes`);
        } catch (processingError) {
          console.error('Error processing audio chunk:', processingError);
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
      
      // Add a test to see if we're getting audio levels
      try {
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkAudioLevel = () => {
          try {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            if (average > 0) {
              console.log('🔊 Audio level detected:', average);
            }
          } catch (levelError) {
            console.warn('Error checking audio level:', levelError);
          }
        };
        
        // Check audio level every 2 seconds for debugging
        const levelCheckInterval = setInterval(checkAudioLevel, 2000);
        
        // Clean up after 10 seconds
        setTimeout(() => {
          clearInterval(levelCheckInterval);
        }, 10000);
      } catch (analyserError) {
        console.warn('Could not create audio analyser:', analyserError);
        // Continue without audio level monitoring
      }
      
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
        
        if (!this.apiKey) {
          reject(new Error('API key is required for WebSocket connection'));
          return;
        }

        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        console.log('🔗 WebSocket URL:', wsUrl.replace(this.apiKey, '[API_KEY_HIDDEN]'));
        
        this.websocket = new WebSocket(wsUrl);

        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.websocket && this.websocket.readyState === WebSocket.CONNECTING) {
            console.error('❌ WebSocket connection timeout');
            this.websocket.close();
            reject(new Error('Connection timeout - please check your internet connection and API key'));
          }
        }, 10000); // 10 second timeout

        this.websocket.onopen = () => {
          console.log('🔗 Gemini Live WebSocket connected');
          clearTimeout(connectionTimeout);
          
          try {
            // Send initial configuration
            this.sendInitialConfig(options);
            
            // Start processing audio chunks
            this.startAudioProcessing();
            
            resolve();
          } catch (setupError) {
            console.error('❌ Error during WebSocket setup:', setupError);
            reject(new Error(`WebSocket setup failed: ${setupError.message}`));
          }
        };

        this.websocket.onmessage = async (event) => {
          try {
            await this.handleWebSocketMessage(event.data);
          } catch (messageError) {
            console.error('❌ Error handling WebSocket message:', messageError);
            // Don't reject here, just log the error to avoid crashing the connection
          }
        };

        this.websocket.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          clearTimeout(connectionTimeout);
          
          // Provide more specific error messages
          if (this.websocket?.readyState === WebSocket.CONNECTING) {
            reject(new Error('Failed to connect to Gemini Live. Please check your API key and internet connection.'));
          } else {
            reject(new Error('WebSocket connection error occurred'));
          }
        };

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

      } catch (error) {
        console.error('❌ Error creating WebSocket:', error);
        reject(new Error(`Failed to create WebSocket connection: ${error.message}`));
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
    // Process accumulated audio chunks every 100ms, but only send when enough time has passed
    this.processingInterval = window.setInterval(() => {
      this.checkAndProcessAccumulatedAudio();
    }, 100);
    
    // Add connection health monitoring
    this.startConnectionHealthCheck();
  }

  private checkAndProcessAccumulatedAudio(): void {
    const now = Date.now();
    
    // Only process if we have chunks and enough time has passed since last processing
    if (this.audioAccumulationBuffer.length > 0 && 
        (now - this.lastProcessTime) >= this.ACCUMULATION_TIME_MS) {
      
      // Move accumulated chunks to processing buffer
      this.audioChunksBuffer = [...this.audioAccumulationBuffer];
      this.audioAccumulationBuffer = [];
      this.lastProcessTime = now;
      
      // Process the accumulated chunks
      this.processAudioChunks();
    }
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

      console.log(`🎵 Processing ${chunks.length} accumulated PCM chunks, total size: ${chunks.reduce((sum, chunk) => sum + chunk.size, 0)} bytes`);

      // Convert accumulated PCM chunks to a single ArrayBuffer
      // Since we're now capturing raw PCM data, no conversion is needed
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
      const combinedBuffer = new ArrayBuffer(totalSize);
      const combinedView = new Uint8Array(combinedBuffer);
      
      let offset = 0;
      for (const chunk of chunks) {
        const chunkBuffer = await chunk.arrayBuffer();
        const chunkView = new Uint8Array(chunkBuffer);
        combinedView.set(chunkView, offset);
        offset += chunkView.length;
      }
      
      // Convert PCM data to base64 as required by Live API
      const base64Audio = this.arrayBufferToBase64(combinedBuffer);

      // Send realtime input to Gemini Live API using PCM format
      const message = {
        realtimeInput: {
          audio: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000"
          }
        }
      };

      this.websocket.send(JSON.stringify(message));
      console.log(`📤 Sent raw PCM audio chunk: ${base64Audio.length} characters (${combinedBuffer.byteLength} bytes) as audio/pcm;rate=16000`);
      
      // Add a small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 10));

    } catch (error) {
      console.error('Error processing accumulated PCM chunks:', error);
      // If processing fails, we'll try again with the next batch
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