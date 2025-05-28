import { DatabaseService } from './database';

// Interface for streaming speech results
export interface StreamingSpeechResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  speakerId?: string;
}

// Interface for streaming speech options
export interface StreamingSpeechOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  enableAutomaticPunctuation?: boolean;
  enableWordTimeOffsets?: boolean;
  model?: 'default' | 'phone_call' | 'video' | 'command_and_search';
  useEnhanced?: boolean;
  profanityFilter?: boolean;
  enableSpeakerDiarization?: boolean;
  diarizationSpeakerCount?: number;
}

// Interface for the streaming service
export interface StreamingSpeechService {
  isAvailable: boolean;
  isStreaming: boolean;
  startStreaming: (options?: StreamingSpeechOptions) => Promise<void>;
  stopStreaming: () => void;
  onResult: (callback: (result: StreamingSpeechResult) => void) => void;
  onError: (callback: (error: Error) => void) => void;
}

// Electron window interface for IPC
interface StreamingElectronAPI {
  startStreamingSpeech: (options: StreamingSpeechOptions) => Promise<{ success: boolean; error?: string }>;
  stopStreamingSpeech: () => Promise<{ success: boolean; error?: string }>;
  onStreamingSpeechResult: (callback: (result: StreamingSpeechResult) => void) => void;
  onStreamingSpeechError: (callback: (error: string) => void) => void;
  removeStreamingSpeechListeners: () => void;
}

class StreamingSpeechServiceImpl implements StreamingSpeechService {
  private resultCallback: ((result: StreamingSpeechResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private _isStreaming = false;
  private _isAvailable = false;

  constructor() {
    this.checkAvailability();
    this.setupListeners();
  }

  private getElectronAPI(): StreamingElectronAPI | null {
    const electronWindow = window as unknown as { electronAPI?: StreamingElectronAPI };
    return electronWindow.electronAPI || null;
  }

  private checkAvailability() {
    const electronAPI = this.getElectronAPI();
    this._isAvailable = !!(electronAPI?.startStreamingSpeech);
    
    if (!this._isAvailable) {
      console.warn('Streaming speech service not available - requires Electron environment');
    }
  }

  private setupListeners() {
    const electronAPI = this.getElectronAPI();
    
    if (electronAPI?.onStreamingSpeechResult) {
      electronAPI.onStreamingSpeechResult((result: StreamingSpeechResult) => {
        if (this.resultCallback) {
          this.resultCallback(result);
        }
      });
    }

    if (electronAPI?.onStreamingSpeechError) {
      electronAPI.onStreamingSpeechError((errorMessage: string) => {
        if (this.errorCallback) {
          this.errorCallback(new Error(errorMessage));
        }
      });
    }
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  async startStreaming(options: StreamingSpeechOptions = {}): Promise<void> {
    if (!this._isAvailable) {
      throw new Error('Streaming speech service is not available');
    }

    if (this._isStreaming) {
      console.warn('Streaming is already active');
      return;
    }

    try {
      // Get API key from settings
      const electronAPIKeys = (window as { electronAPI?: { env?: { GOOGLE_SPEECH_API_KEY?: string } } }).electronAPI;
      const envApiKey = electronAPIKeys?.env?.GOOGLE_SPEECH_API_KEY;
      if (!envApiKey) {
        throw new Error('Google Cloud Speech API key not configured. Please add your Google Cloud Speech API key in Settings → Transcription.');
      }

      const defaultOptions: StreamingSpeechOptions = {
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        model: 'command_and_search',
        useEnhanced: true,
        profanityFilter: false,
        enableSpeakerDiarization: false,
        diarizationSpeakerCount: 4, // Default value, will be overridden by options
        ...options
      };

      const electronAPI = this.getElectronAPI();
      const result = await electronAPI!.startStreamingSpeech(defaultOptions);

      if (!result.success) {
        throw new Error(result.error || 'Failed to start streaming speech');
      }

      this._isStreaming = true;
      console.log('✅ Streaming speech started successfully');
    } catch (error) {
      console.error('❌ Failed to start streaming speech:', error);
      throw error;
    }
  }

  stopStreaming(): void {
    if (!this._isAvailable || !this._isStreaming) {
      return;
    }

    try {
      const electronAPI = this.getElectronAPI();
      electronAPI!.stopStreamingSpeech();
      this._isStreaming = false;
      console.log('✅ Streaming speech stopped');
    } catch (error) {
      console.error('❌ Failed to stop streaming speech:', error);
    }
  }

  onResult(callback: (result: StreamingSpeechResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  cleanup(): void {
    this.stopStreaming();
    this.resultCallback = null;
    this.errorCallback = null;
    
    const electronAPI = this.getElectronAPI();
    if (electronAPI?.removeStreamingSpeechListeners) {
      electronAPI.removeStreamingSpeechListeners();
    }
  }
}

// Export singleton instance
export const streamingSpeechService = new StreamingSpeechServiceImpl();
export default streamingSpeechService; 