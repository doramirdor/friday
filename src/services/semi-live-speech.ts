import { DatabaseService } from './database';

// Interface for semi-live speech results
export interface SemiLiveSpeechResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  speakerId?: string;
}

// Interface for semi-live speech options
export interface SemiLiveSpeechOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  enableAutomaticPunctuation?: boolean;
  chunkDurationMs?: number; // How often to send chunks (in milliseconds)
  model?: 'default' | 'phone_call' | 'video' | 'command_and_search';
  useEnhanced?: boolean;
  profanityFilter?: boolean;
}

// Interface for the semi-live service
export interface SemiLiveSpeechService {
  isAvailable: boolean;
  isRecording: boolean;
  startRecording: (options?: SemiLiveSpeechOptions) => Promise<void>;
  stopRecording: () => void;
  onResult: (callback: (result: SemiLiveSpeechResult) => void) => void;
  onError: (callback: (error: Error) => void) => void;
}

// Electron window interface for IPC
interface SemiLiveElectronAPI {
  startSemiLiveSpeech: (options: SemiLiveSpeechOptions) => Promise<{ success: boolean; error?: string }>;
  stopSemiLiveSpeech: () => Promise<{ success: boolean; error?: string }>;
  onSemiLiveSpeechResult: (callback: (result: SemiLiveSpeechResult) => void) => void;
  onSemiLiveSpeechError: (callback: (error: string) => void) => void;
  removeSemiLiveSpeechListeners: () => void;
}

class SemiLiveSpeechServiceImpl implements SemiLiveSpeechService {
  private resultCallback: ((result: SemiLiveSpeechResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private _isRecording = false;
  private _isAvailable = false;

  constructor() {
    this.checkAvailability();
    this.setupListeners();
  }

  private getElectronAPI(): SemiLiveElectronAPI | null {
    const electronWindow = window as unknown as { electronAPI?: SemiLiveElectronAPI };
    return electronWindow.electronAPI || null;
  }

  private checkAvailability() {
    const electronAPI = this.getElectronAPI();
    this._isAvailable = !!(electronAPI?.startSemiLiveSpeech);
    
    if (!this._isAvailable) {
      console.warn('Semi-live speech service not available - requires Electron environment');
    }
  }

  private setupListeners() {
    const electronAPI = this.getElectronAPI();
    
    if (electronAPI?.onSemiLiveSpeechResult) {
      electronAPI.onSemiLiveSpeechResult((result: SemiLiveSpeechResult) => {
        if (this.resultCallback) {
          this.resultCallback(result);
        }
      });
    }

    if (electronAPI?.onSemiLiveSpeechError) {
      electronAPI.onSemiLiveSpeechError((errorMessage: string) => {
        if (this.errorCallback) {
          this.errorCallback(new Error(errorMessage));
        }
      });
    }
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  async startRecording(options: SemiLiveSpeechOptions = {}): Promise<void> {
    if (!this._isAvailable) {
      throw new Error('Semi-live speech service is not available');
    }

    if (this._isRecording) {
      console.warn('Recording is already active');
      return;
    }

    try {
      // Get API key from settings
      const electronAPIKeys = (window as { electronAPI?: { env?: { GOOGLE_SPEECH_API_KEY?: string } } }).electronAPI;
      const envApiKey = electronAPIKeys?.env?.GOOGLE_SPEECH_API_KEY;
      if (!envApiKey) {
        throw new Error('Google Cloud Speech API key not configured. Please add your Google Cloud Speech API key in Settings → Transcription.');
      }

      const defaultOptions: SemiLiveSpeechOptions = {
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        chunkDurationMs: 3000, // Send chunks every 3 seconds
        model: 'command_and_search',
        useEnhanced: true,
        profanityFilter: false,
        ...options
      };

      const electronAPI = this.getElectronAPI();
      const result = await electronAPI!.startSemiLiveSpeech(defaultOptions);

      if (!result.success) {
        throw new Error(result.error || 'Failed to start semi-live speech');
      }

      this._isRecording = true;
      console.log('✅ Semi-live speech started successfully');
    } catch (error) {
      console.error('❌ Failed to start semi-live speech:', error);
      throw error;
    }
  }

  stopRecording(): void {
    if (!this._isAvailable || !this._isRecording) {
      return;
    }

    try {
      const electronAPI = this.getElectronAPI();
      electronAPI!.stopSemiLiveSpeech();
      this._isRecording = false;
      console.log('✅ Semi-live speech stopped');
    } catch (error) {
      console.error('❌ Failed to stop semi-live speech:', error);
    }
  }

  onResult(callback: (result: SemiLiveSpeechResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  cleanup(): void {
    this.stopRecording();
    this.resultCallback = null;
    this.errorCallback = null;
    
    const electronAPI = this.getElectronAPI();
    if (electronAPI?.removeSemiLiveSpeechListeners) {
      electronAPI.removeSemiLiveSpeechListeners();
    }
  }
}

// Export singleton instance
export const semiLiveSpeechService = new SemiLiveSpeechServiceImpl();
export default semiLiveSpeechService; 