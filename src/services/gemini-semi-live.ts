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

// Electron API interfaces
interface SavedAudioFile {
  format: string;
  path: string;
}

interface SaveAudioFileResult {
  success: boolean;
  files?: SavedAudioFile[];
  filePath?: string;
  message?: string;
  error?: string;
}

interface TranscriptionSpeaker {
  id: string;
  name: string;
  color: string;
}

interface TranscriptionResult {
  transcript?: string;
  speakers?: TranscriptionSpeaker[];
}

interface TestSpeechResult {
  transcription: string | TranscriptionResult;
  error?: string;
}

interface ElectronAPI {
  saveAudioFile: (buffer: ArrayBuffer, filename: string, formats: string[]) => Promise<SaveAudioFileResult>;
  testSpeechWithFile: (filePath: string) => Promise<TestSpeechResult>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// File-based audio chunk interface
interface AudioChunk {
  timestamp: number;
  filePath: string;
  size: number;
}

// Processing state for file-based approach
interface ProcessingState {
  isRecording: boolean;
  processingMode: 'continuous' | 'send-at-end';
  chunkDurationMs: number;
  audioChunks: AudioChunk[];
  lastProcessedTime: number;
  totalChunksProcessed: number;
  tempFileCounter: number;
}

// Options for the simplified file-based service
interface FileSemiLiveOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakerCount?: number;
  chunkDurationMs?: number;
  processingMode?: 'continuous' | 'send-at-end';
}

// Result from file-based transcription
interface FileSemiLiveResult {
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

class FileSemiLiveService {
  private state: ProcessingState = {
    isRecording: false,
    processingMode: 'send-at-end',
    chunkDurationMs: 1000,
    audioChunks: [],
    lastProcessedTime: 0,
    totalChunksProcessed: 0,
    tempFileCounter: 0
  };
  
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private currentOptions: FileSemiLiveOptions | null = null;
  private processingInterval: number | null = null;

  // Event handling for callbacks
  private resultCallback: ((result: FileSemiLiveResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  async startRecording(options: FileSemiLiveOptions): Promise<boolean> {
    try {
      console.log('🎤 Starting File-based Semi-Live recording with options:', options);
      
      this.currentOptions = options;
      this.state.processingMode = options.processingMode || 'send-at-end';
      this.state.chunkDurationMs = options.chunkDurationMs || 1000;
      this.state.isRecording = true;
      this.state.audioChunks = [];
      this.state.lastProcessedTime = Date.now();
      this.state.totalChunksProcessed = 0;
      this.state.tempFileCounter = 0;

      const success = await this.startMicrophoneCapture(options);
      if (!success) {
        this.state.isRecording = false;
        return false;
      }

      if (this.state.processingMode === 'continuous') {
        console.log('🔄 Using continuous mode - processing files every', this.state.chunkDurationMs, 'ms');
        this.setupAudioProcessingInterval();
      } else {
        console.log('📥 Using "send-at-end" mode - files will be processed when recording stops');
      }

      console.log('✅ File-based Semi-Live recording started successfully');
      return true;
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      this.state.isRecording = false;
      this.emitError(error as Error);
      return false;
    }
  }

  private setupAudioProcessingInterval() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = window.setInterval(async () => {
      if (!this.state.isRecording) {
        if (this.processingInterval) {
          clearInterval(this.processingInterval);
          this.processingInterval = null;
        }
        return;
      }

      if (this.state.audioChunks.length > 0) {
        console.log(`🔄 Processing ${this.state.audioChunks.length} audio files in continuous mode`);
        await this.processAccumulatedAudioFiles();
      }
    }, this.state.chunkDurationMs);

    console.log('✅ Audio processing interval set successfully');
  }

  async stopRecording(): Promise<FileSemiLiveResult[]> {
    try {
      console.log('🛑 Stopping File-based Semi-Live recording...');
      
      this.state.isRecording = false;
      
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }
      
      if (this.scriptProcessor) {
        this.scriptProcessor.disconnect();
        this.scriptProcessor = null;
      }
      
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
        this.audioContext = null;
      }

      let results: FileSemiLiveResult[] = [];

      if (this.state.audioChunks.length > 0) {
        console.log(`📤 Processing ${this.state.audioChunks.length} accumulated audio files`);
        results = await this.processAccumulatedAudioFiles();
      }

      await this.cleanupTempFiles();

      console.log('✅ Recording stopped successfully');
      return results;
    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      this.emitError(error as Error);
      return [];
    }
  }

  private async startMicrophoneCapture(options: FileSemiLiveOptions): Promise<boolean> {
    try {
      console.log('🎤 Requesting microphone access...');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: options.sampleRateHertz || 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('✅ Microphone access granted');
      
      this.audioContext = new AudioContext({
        sampleRate: options.sampleRateHertz || 16000
      });
      
      console.log('✅ AudioContext created with sample rate:', this.audioContext.sampleRate);
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.gainNode = this.audioContext.createGain();
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(this.gainNode);
      this.gainNode.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      
      console.log('✅ Audio processing chain connected');
      
      console.log('🔍 Audio chain verification:', {
        sourceState: source.context.state,
        processorBufferSize: this.scriptProcessor.bufferSize,
        audioContextSampleRate: this.audioContext.sampleRate,
        audioContextState: this.audioContext.state,
        mediaStreamActive: this.mediaStream.active,
        mediaStreamTracks: this.mediaStream.getAudioTracks().length
      });

      this.scriptProcessor.onaudioprocess = async (event) => {
        if (!this.state.isRecording) return;
        
        const inputBuffer = event.inputBuffer;
        const audioData = inputBuffer.getChannelData(0);
        await this.saveAudioChunkAsFile(audioData, this.audioContext!.sampleRate);
      };
      
      return true;
    } catch (error) {
      console.error('❌ Error setting up microphone capture:', error);
      this.emitError(error as Error);
      return false;
    }
  }

  private async saveAudioChunkAsFile(audioData: Float32Array, sampleRate: number): Promise<void> {
    try {
      const pcm16Data = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioData[i]));
        pcm16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }

      const wavBuffer = this.createWavFile(pcm16Data, sampleRate);
      
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.saveAudioFile) {
        const fileName = `temp_chunk_${this.state.tempFileCounter++}_${Date.now()}`;
        const result: SaveAudioFileResult = await electronAPI.saveAudioFile(wavBuffer, fileName, ['wav']);
        
        if (result.success) {
          let filePath = '';
          if (result.files && result.files.length > 0) {
            const wavFile = result.files.find((f: SavedAudioFile) => f.format === 'wav');
            filePath = wavFile ? wavFile.path : result.files[0].path;
          } else if (result.filePath) {
            filePath = result.filePath;
            if (!filePath.toLowerCase().endsWith('.wav')) {
              filePath = filePath + '.wav';
            }
          }
          
          if (filePath) {
            this.state.audioChunks.push({
              timestamp: Date.now(),
              filePath: filePath,
              size: wavBuffer.byteLength
            });
            
            console.log(`💾 Saved audio chunk: ${fileName}.wav (${wavBuffer.byteLength} bytes) -> ${filePath}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error saving audio chunk as file:', error);
      this.emitError(error as Error);
    }
  }

  private createWavFile(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
    const length = pcmData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    const offset = 44;
    for (let i = 0; i < length; i++) {
      view.setInt16(offset + i * 2, pcmData[i], true);
    }
    
    return buffer;
  }

  private async processAccumulatedAudioFiles(): Promise<FileSemiLiveResult[]> {
    if (this.state.audioChunks.length === 0) {
      return [];
    }

    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.testSpeechWithFile) {
        console.error('❌ Electron transcription API not available');
        return [];
      }

      const results: FileSemiLiveResult[] = [];

      for (const chunk of this.state.audioChunks) {
        try {
          console.log(`🔄 Transcribing audio file: ${chunk.filePath}`);
          const transcriptionResult: TestSpeechResult = await electronAPI.testSpeechWithFile(chunk.filePath);
          
          if (transcriptionResult.transcription) {
            const transcriptText = typeof transcriptionResult.transcription === 'string' 
              ? transcriptionResult.transcription 
              : transcriptionResult.transcription.transcript;

            if (transcriptText && transcriptText.trim()) {
              const result: FileSemiLiveResult = {
                transcript: transcriptText.trim(),
                isFinal: true,
                speakers: typeof transcriptionResult.transcription === 'string' 
                  ? [] 
                  : transcriptionResult.transcription.speakers || [],
                timestamp: chunk.timestamp
              };
              
              results.push(result);
              
              // Emit result to callback if registered
              this.emitResult(result);
              
              console.log('✅ Transcription result:', transcriptText.trim());
            }
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
      console.error('❌ Error processing accumulated audio files:', error);
      this.emitError(error as Error);
      return [];
    }
  }

  private async cleanupTempFiles(): Promise<void> {
    try {
      const electronAPI = (window as any).electronAPI;
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
  private emitResult(result: FileSemiLiveResult): void {
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
  onResult(callback: (result: FileSemiLiveResult) => void): void {
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
    return !!(window as any).electronAPI?.saveAudioFile && 
           !!(window as any).electronAPI?.testSpeechWithFile;
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

// Adapter to make the file service compatible with existing interfaces
class LegacyAdapter implements GeminiSemiLiveService {
  private fileService = new FileSemiLiveService();
  
  async startRecording(options: GeminiSemiLiveOptions): Promise<boolean> {
    return this.fileService.startRecording(options);
  }
  
  async stopRecording(): Promise<GeminiSemiLiveResult[]> {
    return this.fileService.stopRecording();
  }
  
  isRecording(): boolean {
    return this.fileService.isRecording();
  }
  
  get isAvailable(): boolean {
    return this.fileService.isAvailable;
  }
  
  getProcessingStats(): ProcessingStats {
    return this.fileService.getProcessingStats();
  }
  
  getSpeakerContext(): SpeakerContext[] {
    return [];
  }
  
  clearSpeakerContext(): void {
    // No-op for file-based approach
  }

  onResult(callback: (result: GeminiSemiLiveResult) => void): void {
    this.fileService.onResult(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.fileService.onError(callback);
  }

  destroy(): void {
    this.fileService.destroy();
  }
}

// Export the service using the original name for compatibility
export const geminiSemiLiveService = new LegacyAdapter(); 