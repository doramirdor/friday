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

// Import Gemini service for transcription
import geminiService, { GeminiTranscriptionResult } from './gemini';

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

// Extended ElectronAPI interface for this service's needs
interface ExtendedElectronAPI {
  saveAudioFile: (buffer: ArrayBuffer, filename: string, formats: string[]) => Promise<SaveAudioFileResult>;
  readAudioFile: (path: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  checkFileExists: (path: string) => Promise<boolean>;
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
    processingMode: 'continuous',
    chunkDurationMs: 2000, // Changed to 2 seconds for better performance
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
  private audioBuffer: Float32Array[] = [];

  // Event handling for callbacks
  private resultCallback: ((result: FileSemiLiveResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  async startRecording(options: FileSemiLiveOptions): Promise<boolean> {
    try {
      console.log('🎤 Starting File-based Semi-Live recording with Gemini 2.0 Flash:', options);
      
      this.currentOptions = options;
      this.state.processingMode = options.processingMode || 'continuous';
      this.state.chunkDurationMs = options.chunkDurationMs || 2000; // Default 2 seconds
      this.state.isRecording = true;
      this.state.audioChunks = [];
      this.state.lastProcessedTime = Date.now();
      this.state.totalChunksProcessed = 0;
      this.state.tempFileCounter = 0;
      this.audioBuffer = [];

      const success = await this.startMicrophoneCapture(options);
      if (!success) {
        this.state.isRecording = false;
        return false;
      }

      if (this.state.processingMode === 'continuous') {
        console.log('🔄 Using continuous mode - processing files every', this.state.chunkDurationMs, 'ms with Gemini 2.0 Flash');
        this.setupAudioProcessingInterval();
      } else {
        console.log('📥 Using "send-at-end" mode - files will be processed when recording stops');
      }

      console.log('✅ File-based Semi-Live recording started successfully with Gemini transcription');
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
      if (!this.state.isRecording || this.audioBuffer.length === 0) {
        return;
      }

      try {
        console.log(`🔄 Processing audio buffer (${this.audioBuffer.length} chunks) for Gemini transcription`);
        
        // Combine audio chunks into single buffer
        const totalLength = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
        const combinedBuffer = new Float32Array(totalLength);
        
        let offset = 0;
        for (const chunk of this.audioBuffer) {
          combinedBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        // Clear buffer for next chunk
        this.audioBuffer = [];

        // Skip if too small (less than 0.5 seconds)
        if (combinedBuffer.length < 8000) { // 0.5 seconds at 16kHz
          console.log('⏭️ Skipping small audio chunk');
          return;
        }

        // Save as temporary WAV file
        await this.saveAudioChunkAsFile(combinedBuffer, 16000);

        // Process immediately if in continuous mode
        if (this.state.processingMode === 'continuous' && this.state.audioChunks.length > 0) {
          const latestChunk = this.state.audioChunks[this.state.audioChunks.length - 1];
          await this.processChunkWithGemini(latestChunk);
        }

      } catch (error) {
        console.error('❌ Error in audio processing interval:', error);
        this.emitError(error as Error);
      }
    }, this.state.chunkDurationMs);
  }

  async stopRecording(): Promise<FileSemiLiveResult[]> {
    console.log('🛑 Stopping Semi-Live Gemini transcription recording...');
    
    this.state.isRecording = false;

    // Clear processing interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    let results: FileSemiLiveResult[] = [];

    try {
      // Process remaining audio buffer
      if (this.audioBuffer.length > 0) {
        console.log('📝 Processing final audio buffer with Gemini...');
        const totalLength = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
        const combinedBuffer = new Float32Array(totalLength);
        
        let offset = 0;
        for (const chunk of this.audioBuffer) {
          combinedBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        await this.saveAudioChunkAsFile(combinedBuffer, 16000);
        this.audioBuffer = [];
      }

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
    } finally {
      // Cleanup audio resources
      this.cleanupAudioResources();
    }

    console.log(`✅ Semi-Live Gemini recording stopped. Processed ${results.length} chunks.`);
    return results;
  }

  private cleanupAudioResources(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.audioBuffer = [];
  }

  private async startMicrophoneCapture(options: FileSemiLiveOptions): Promise<boolean> {
    try {
      console.log('🎙️ Starting microphone capture for Semi-Live Gemini transcription');
      
      // Get microphone permission
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          sampleRate: options.sampleRateHertz || 16000, 
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: options.sampleRateHertz || 16000 });
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.gainNode = this.audioContext.createGain();
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // Setup audio processing
      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.state.isRecording) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        if (inputData && inputData.length > 0) {
          this.audioBuffer.push(new Float32Array(inputData));
        }
      };

      // Connect audio processing pipeline
      source.connect(this.gainNode);
      this.gainNode.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      console.log('✅ Microphone capture started for Gemini Semi-Live');
      return true;

    } catch (error) {
      console.error('❌ Error starting microphone capture:', error);
      this.emitError(error as Error);
      return false;
    }
  }

  private async saveAudioChunkAsFile(audioData: Float32Array, sampleRate: number): Promise<void> {
    try {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (!electronAPI?.saveAudioFile) {
        throw new Error('Electron saveAudioFile API not available');
      }

      // Convert to 16-bit PCM
      const pcmData = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        pcmData[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
      }

      // Create WAV file buffer
      const wavBuffer = this.createWavFile(pcmData, sampleRate);
      
      // Save as temporary file
      const filename = `semilive_gemini_${Date.now()}_${this.state.tempFileCounter++}.wav`;
      const result: SaveAudioFileResult = await electronAPI.saveAudioFile(wavBuffer, filename, ['wav']);

      if (result.success && result.filePath) {
        const chunk: AudioChunk = {
          timestamp: Date.now(),
          filePath: result.filePath,
          size: wavBuffer.byteLength
        };
        
        this.state.audioChunks.push(chunk);
        console.log(`💾 Saved audio chunk for Gemini: ${result.filePath} (${(wavBuffer.byteLength / 1024).toFixed(1)} KB)`);
      } else {
        throw new Error(`Failed to save audio file: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ Error saving audio chunk:', error);
      this.emitError(error as Error);
    }
  }

  private createWavFile(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // WAV header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length * 2, true);
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
    view.setUint32(40, pcmData.length * 2, true);

    // PCM data
    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(44 + i * 2, pcmData[i], true);
    }
    
    return buffer;
  }

  // NEW: Process chunk using Gemini 2.0 Flash instead of Google Cloud Speech
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
        const fileSemiResult: FileSemiLiveResult = {
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
        this.emitResult(fileSemiResult);
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

  // NEW: Process all accumulated files using Gemini 2.0 Flash
  private async processAccumulatedAudioFilesWithGemini(): Promise<FileSemiLiveResult[]> {
    if (this.state.audioChunks.length === 0) {
      return [];
    }

    try {
      const results: FileSemiLiveResult[] = [];

      for (const chunk of this.state.audioChunks) {
        try {
          console.log(`🧠 Transcribing audio file with Gemini: ${chunk.filePath}`);
          
          // Use the same Gemini transcription method as regular flow
          const result: GeminiTranscriptionResult = await geminiService.transcribeAudio(
            chunk.filePath,
            this.currentOptions?.maxSpeakerCount || 4
          );

          if (result.transcript && result.transcript.trim()) {
            const fileSemiResult: FileSemiLiveResult = {
              transcript: result.transcript.trim(),
              isFinal: true,
              speakers: result.speakers?.map(speaker => ({
                id: speaker.id,
                name: speaker.name,
                color: speaker.color
              })) || [],
              timestamp: chunk.timestamp
            };
            
            results.push(fileSemiResult);
            this.emitResult(fileSemiResult);
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
    const electronAPI = window.electronAPI as ExtendedElectronAPI;
    return !!(electronAPI?.saveAudioFile) && 
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