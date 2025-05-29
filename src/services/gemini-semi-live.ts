// Export the result interfaces for public use
export interface GeminiSemiLiveResult {
  transcript: string;
  isFinal: boolean;
  speakers?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  speakerContext?: Array<{
    id: string;
    name: string;
    color: string;
    lastSeen: number;
    totalSegments: number;
  }>;
  timestamp: number;
}

export interface GeminiSemiLiveOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakerCount?: number;
  chunkDurationMs?: number;
  processingMode?: 'continuous' | 'send-at-end';
  recordingSource?: 'system' | 'mic' | 'both';
}

// Processing stats interface
export interface ProcessingStats {
  isRecording: boolean;
  processingMode: 'continuous' | 'send-at-end';
  chunkDurationMs: number;
  totalChunks: number;
  totalProcessed: number;
  lastProcessedTime: number;
}

// Speaker context interface
export interface SpeakerContext {
  id: string;
  name: string;
  color: string;
  lastSeen: number;
  totalSegments: number;
}

// Import Gemini service for transcription
import geminiService, { GeminiTranscriptionResult } from './gemini';

// Extended ElectronAPI interface for this service's needs
interface ExtendedElectronAPI {
  startSemiLiveRecording: (options: {
    chunkDurationMs: number;
    source: string;
    filename: string;
  }) => Promise<{ success: boolean; error?: string }>;
  stopSemiLiveRecording: () => Promise<{ success: boolean; error?: string }>;
  readAudioFile: (path: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  checkFileExists: (path: string) => Promise<boolean>;
}

// Audio chunk interface for Electron-based recording
interface AudioChunk {
  timestamp: number;
  filePath: string;
  size: number;
  chunkIndex: number;
}

// Processing state for Electron-based recording
interface ProcessingState {
  isRecording: boolean;
  processingMode: 'continuous' | 'send-at-end';
  chunkDurationMs: number;
  audioChunks: AudioChunk[];
  lastProcessedTime: number;
  totalChunksProcessed: number;
  chunkCounter: number;
  recordingSource: string;
}

// Options for the Electron-based service
interface ElectronSemiLiveOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakerCount?: number;
  chunkDurationMs?: number;
  processingMode?: 'continuous' | 'send-at-end';
  recordingSource?: 'system' | 'mic' | 'both';
}

// Result from Electron-based transcription
interface ElectronSemiLiveResult {
  transcript: string;
  isFinal: boolean;
  speakers?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  speakerContext?: Array<{
    id: string;
    name: string;
    color: string;
    lastSeen: number;
    totalSegments: number;
  }>;
  timestamp: number;
}

class ElectronSemiLiveService {
  private state: ProcessingState = {
    isRecording: false,
    processingMode: 'continuous',
    chunkDurationMs: 2000, // 2 seconds for optimal performance
    audioChunks: [],
    lastProcessedTime: 0,
    totalChunksProcessed: 0,
    chunkCounter: 0,
    recordingSource: 'mic'
  };
  
  private currentOptions: ElectronSemiLiveOptions | null = null;
  private chunkingInterval: number | null = null;
  private currentRecordingId: string | null = null;

  // Event handling for callbacks
  private resultCallback: ((result: ElectronSemiLiveResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  constructor() {
    // Listen for chunk completion events from Electron
    this.setupElectronListeners();
  }

  private setupElectronListeners(): void {
    // Setup listeners for semi-live recording events
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Listen for chunk-ready events (we'll implement this IPC)
      const electronAPI = window.electronAPI as ExtendedElectronAPI & { onSemiLiveChunk?: (callback: (chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }) => void) => void };
      if (electronAPI.onSemiLiveChunk) {
        electronAPI.onSemiLiveChunk((chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }) => {
          this.handleChunkReady(chunkData);
        });
      }
    }
  }

  async startRecording(options: ElectronSemiLiveOptions): Promise<boolean> {
    try {
      console.log('🎤 Starting Electron-based Semi-Live recording with Gemini 2.0 Flash:', options);
      
      this.currentOptions = options;
      this.state.processingMode = options.processingMode || 'continuous';
      this.state.chunkDurationMs = options.chunkDurationMs || 2000; // Default 2 seconds
      this.state.recordingSource = options.recordingSource || 'mic';
      this.state.isRecording = true;
      this.state.audioChunks = [];
      this.state.lastProcessedTime = Date.now();
      this.state.totalChunksProcessed = 0;
      this.state.chunkCounter = 0;

      // Generate unique recording ID
      this.currentRecordingId = `semi_live_${Date.now()}`;

      const success = await this.startElectronRecording();
      if (!success) {
        this.state.isRecording = false;
        return false;
      }

      // Start chunking interval to create chunks every N seconds
      this.setupChunkingInterval();

      console.log('✅ Electron-based Semi-Live recording started successfully with Gemini transcription');
      return true;
    } catch (error) {
      console.error('❌ Error starting Electron recording:', error);
      this.state.isRecording = false;
      this.emitError(error as Error);
      return false;
    }
  }

  private async startElectronRecording(): Promise<boolean> {
    try {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (!electronAPI?.startSemiLiveRecording) {
        throw new Error('Electron semi-live recording API not available');
      }

      console.log(`🎙️ Starting Electron ${this.state.recordingSource} recording for semi-live chunks`);
      
      const result = await electronAPI.startSemiLiveRecording({
        chunkDurationMs: this.state.chunkDurationMs,
        source: this.state.recordingSource,
        filename: this.currentRecordingId || 'semi_live'
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to start Electron recording');
      }

      return true;
    } catch (error) {
      console.error('❌ Error starting Electron recording:', error);
      this.emitError(error as Error);
      return false;
    }
  }

  private setupChunkingInterval(): void {
    if (this.chunkingInterval) {
      clearInterval(this.chunkingInterval);
    }

    console.log(`🔄 Setting up ${this.state.chunkDurationMs}ms chunking interval for Gemini processing`);

    this.chunkingInterval = window.setInterval(async () => {
      if (!this.state.isRecording) {
        return;
      }

      // Request a chunk from the ongoing recording
      await this.requestChunk();
    }, this.state.chunkDurationMs);
  }

  private async requestChunk(): Promise<void> {
    try {
      // Request Electron to save current recording buffer as a chunk
      const electronAPI = window.electronAPI as ExtendedElectronAPI & { requestSemiLiveChunk?: (options: { filename: string }) => Promise<void> };
      if (electronAPI.requestSemiLiveChunk) {
        const chunkFilename = `${this.currentRecordingId}_chunk_${this.state.chunkCounter++}`;
        await electronAPI.requestSemiLiveChunk({ filename: chunkFilename });
      }
    } catch (error) {
      console.error('❌ Error requesting chunk:', error);
      this.emitError(error as Error);
    }
  }

  private async handleChunkReady(chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }): Promise<void> {
    if (!this.state.isRecording) return;

    console.log(`📁 Chunk ready: ${chunkData.filePath} (${(chunkData.size / 1024).toFixed(1)} KB)`);

    const chunk: AudioChunk = {
      timestamp: chunkData.timestamp,
      filePath: chunkData.filePath,
      size: chunkData.size,
      chunkIndex: chunkData.chunkIndex
    };

    this.state.audioChunks.push(chunk);

    // Process immediately if in continuous mode
    if (this.state.processingMode === 'continuous') {
      await this.processChunkWithGemini(chunk);
    }
  }

  async stopRecording(): Promise<ElectronSemiLiveResult[]> {
    console.log('🛑 Stopping Electron Semi-Live Gemini transcription recording...');
    
    this.state.isRecording = false;

    // Clear chunking interval
    if (this.chunkingInterval) {
      clearInterval(this.chunkingInterval);
      this.chunkingInterval = null;
    }

    let results: ElectronSemiLiveResult[] = [];

    try {
      // Stop the Electron recording
      await this.stopElectronRecording();

      // Process accumulated files if in send-at-end mode
      if (this.state.processingMode === 'send-at-end') {
        console.log('📤 Processing all audio chunks with Gemini at end...');
        results = await this.processAccumulatedAudioFilesWithGemini();
      }

      // Cleanup temporary files
      await this.cleanupTempFiles();

    } catch (error) {
      console.error('❌ Error during stop recording:', error);
      this.emitError(error as Error);
    }

    console.log(`✅ Electron Semi-Live Gemini recording stopped. Processed ${results.length} chunks.`);
    return results;
  }

  private async stopElectronRecording(): Promise<void> {
    try {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (electronAPI?.stopSemiLiveRecording) {
        const result = await electronAPI.stopSemiLiveRecording();
        if (!result.success) {
          console.warn('⚠️ Warning stopping Electron recording:', result.error);
        }
      }
    } catch (error) {
      console.error('❌ Error stopping Electron recording:', error);
    }
  }

  // Process chunk using Gemini 2.0 Flash (same as before)
  private async processChunkWithGemini(chunk: AudioChunk): Promise<void> {
    try {
      console.log(`🧠 Transcribing chunk with Gemini 2.0 Flash: ${chunk.filePath}`);
      const startTime = Date.now();

      // Use the same Gemini transcription method as regular flow
      const result: GeminiTranscriptionResult = await geminiService.transcribeAudio(
        chunk.filePath,
        this.currentOptions?.maxSpeakerCount || 4
      );

      const processingTime = Date.now() - startTime;
      console.log(`⚡ Gemini transcription completed in ${processingTime}ms`);

      if (result.transcript && result.transcript.trim()) {
        const electronSemiResult: ElectronSemiLiveResult = {
          transcript: result.transcript,
          isFinal: true, // Gemini results are always final
          speakers: result.speakers?.map(speaker => ({
            id: speaker.id,
            name: speaker.name,
            color: speaker.color
          })) || [],
          timestamp: chunk.timestamp
        };

        // Emit result to callback
        this.emitResult(electronSemiResult);
        console.log('✅ Gemini transcription result:', result.transcript);
      }

      // Remove chunk from pending list and cleanup file
      this.state.audioChunks = this.state.audioChunks.filter(c => c.filePath !== chunk.filePath);
      this.state.totalChunksProcessed++;
      await this.cleanupFile(chunk.filePath);

    } catch (error) {
      console.error(`❌ Error processing chunk with Gemini ${chunk.filePath}:`, error);
      this.emitError(error as Error);
      
      // Try to cleanup the file even on error
      try {
        await this.cleanupFile(chunk.filePath);
      } catch (cleanupError) {
        console.error('❌ Error cleaning up failed chunk:', cleanupError);
      }
    }
  }

  // Process all accumulated files using Gemini 2.0 Flash (same as before)
  private async processAccumulatedAudioFilesWithGemini(): Promise<ElectronSemiLiveResult[]> {
    if (this.state.audioChunks.length === 0) {
      return [];
    }

    try {
      const results: ElectronSemiLiveResult[] = [];

      for (const chunk of this.state.audioChunks) {
        try {
          console.log(`🧠 Transcribing audio file with Gemini: ${chunk.filePath}`);
          
          // Use the same Gemini transcription method as regular flow
          const result: GeminiTranscriptionResult = await geminiService.transcribeAudio(
            chunk.filePath,
            this.currentOptions?.maxSpeakerCount || 4
          );

          if (result.transcript && result.transcript.trim()) {
            const electronSemiResult: ElectronSemiLiveResult = {
              transcript: result.transcript.trim(),
              isFinal: true,
              speakers: result.speakers?.map(speaker => ({
                id: speaker.id,
                name: speaker.name,
                color: speaker.color
              })) || [],
              timestamp: chunk.timestamp
            };
            
            results.push(electronSemiResult);
            this.emitResult(electronSemiResult);
            console.log('✅ Gemini transcription result:', result.transcript.trim());
          }
        } catch (error) {
          console.error(`❌ Error transcribing chunk ${chunk.filePath}:`, error);
          this.emitError(error as Error);
        }
      }

      this.state.audioChunks = [];
      this.state.totalChunksProcessed += results.length;

      return results;
    } catch (error) {
      console.error('❌ Error processing accumulated audio files with Gemini:', error);
      this.emitError(error as Error);
      return [];
    }
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (electronAPI?.deleteFile) {
        await electronAPI.deleteFile(filePath);
        console.log(`🗑️ Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not delete temp file ${filePath}:`, error);
    }
  }

  private async cleanupTempFiles(): Promise<void> {
    try {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (!electronAPI?.deleteFile) {
        console.warn('⚠️ Electron deleteFile API not available for cleanup');
        return;
      }

      for (const chunk of this.state.audioChunks) {
        try {
          await electronAPI.deleteFile(chunk.filePath);
          console.log(`🗑️ Cleaned up temp file: ${chunk.filePath}`);
        } catch (error) {
          console.warn(`⚠️ Could not delete temp file ${chunk.filePath}:`, error);
        }
      }

      this.state.audioChunks = [];
    } catch (error) {
      console.error('❌ Error during temp file cleanup:', error);
    }
  }

  // Event handling methods
  private emitResult(result: ElectronSemiLiveResult): void {
    if (this.resultCallback) {
      this.resultCallback(result);
    }
  }

  private emitError(error: Error): void {
    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }

  // Public event registration methods
  onResult(callback: (result: ElectronSemiLiveResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  destroy(): void {
    this.resultCallback = null;
    this.errorCallback = null;
    if (this.state.isRecording) {
      this.stopRecording();
    }
  }

  get isAvailable(): boolean {
    const electronAPI = window.electronAPI as ExtendedElectronAPI;
    return !!(electronAPI?.startSemiLiveRecording) && 
           !!(electronAPI?.readAudioFile) &&
           !!(electronAPI?.deleteFile) &&
           geminiService.isAvailable();
  }

  isRecording(): boolean {
    return this.state.isRecording;
  }

  getProcessingStats() {
    return {
      isRecording: this.state.isRecording,
      processingMode: this.state.processingMode,
      chunkDurationMs: this.state.chunkDurationMs,
      totalChunks: this.state.audioChunks.length,
      totalProcessed: this.state.totalChunksProcessed,
      lastProcessedTime: this.state.lastProcessedTime
    };
  }
}

// Keep the original service interface for backward compatibility
export interface GeminiSemiLiveService {
  startRecording: (options: GeminiSemiLiveOptions) => Promise<boolean>;
  stopRecording: () => Promise<GeminiSemiLiveResult[]>;
  isRecording: () => boolean;
  isAvailable: boolean;
  getProcessingStats: () => ProcessingStats;
  getSpeakerContext: () => SpeakerContext[];
  clearSpeakerContext: () => void;
  onResult: (callback: (result: GeminiSemiLiveResult) => void) => void;
  onError: (callback: (error: Error) => void) => void;
  destroy: () => void;
}

// Adapter to make the Electron service compatible with existing interfaces
class LegacyAdapter implements GeminiSemiLiveService {
  private electronService = new ElectronSemiLiveService();
  
  async startRecording(options: GeminiSemiLiveOptions): Promise<boolean> {
    return this.electronService.startRecording(options);
  }
  
  async stopRecording(): Promise<GeminiSemiLiveResult[]> {
    return this.electronService.stopRecording();
  }
  
  isRecording(): boolean {
    return this.electronService.isRecording();
  }
  
  get isAvailable(): boolean {
    return this.electronService.isAvailable;
  }
  
  getProcessingStats(): ProcessingStats {
    return this.electronService.getProcessingStats();
  }
  
  getSpeakerContext(): SpeakerContext[] {
    return [];
  }
  
  clearSpeakerContext(): void {
    // No-op for Electron-based approach
  }

  onResult(callback: (result: GeminiSemiLiveResult) => void): void {
    this.electronService.onResult(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.electronService.onError(callback);
  }

  destroy(): void {
    this.electronService.destroy();
  }
}

// Export the service using the original name for compatibility
export const geminiSemiLiveService = new LegacyAdapter();