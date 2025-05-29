// Import types
import geminiService, { GeminiTranscriptionResult } from './gemini';

interface ExtendedElectronAPI {
  saveAudioFile: (buffer: ArrayBuffer, filename: string, formats: string[]) => Promise<{
    success: boolean;
    files?: Array<{ format: string; path: string }>;
    error?: string;
  }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    electronAPI: ExtendedElectronAPI;
  }
}

// Unified Gemini Live Transcription Service
// Reuses existing proven Gemini transcribeAudio method and file-based approach

export interface GeminiLiveOptions {
  languageCode?: string;
  chunkDurationMs?: number; // How often to process chunks (default: 2000ms)
  enableSpeakerDiarization?: boolean;
  maxSpeakers?: number;
  processingMode?: 'continuous' | 'send-at-end';
}

export interface GeminiLiveResult {
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

export interface GeminiLiveStats {
  isRecording: boolean;
  processingMode: 'continuous' | 'send-at-end';
  chunkDurationMs: number;
  audioChunksCollected: number;
  chunksProcessed: number;
  totalProcessingTime: number;
  currentChunkSize: number;
  lastProcessedTime: number;
}

// Audio chunk storage
interface AudioChunk {
  timestamp: number;
  filePath: string;
  size: number;
  duration: number;
}

class GeminiLiveUnifiedService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private audioBuffer: Float32Array[] = [];
  private processingInterval: number | null = null;
  private isRecording = false;
  private tempFileCounter = 0;
  
  private options: Required<GeminiLiveOptions> = {
    languageCode: 'en-US',
    chunkDurationMs: 2000, // 2 seconds for responsive feel
    enableSpeakerDiarization: true,
    maxSpeakers: 4,
    processingMode: 'continuous'
  };

  // Audio chunks for processing
  private audioChunks: AudioChunk[] = [];
  private stats: GeminiLiveStats = {
    isRecording: false,
    processingMode: 'continuous',
    chunkDurationMs: 2000,
    audioChunksCollected: 0,
    chunksProcessed: 0,
    totalProcessingTime: 0,
    currentChunkSize: 0,
    lastProcessedTime: 0
  };

  // Speaker context management
  private speakerContext: Array<{
    id: string;
    name: string;
    color: string;
    lastSeen: number;
    totalSegments: number;
  }> = [];

  private speakerContextTimeout = 5 * 60 * 1000; // 5 minutes

  // Event callbacks
  private resultCallback: ((result: GeminiLiveResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  constructor() {
    this.updateStats();
  }

  get isAvailable(): boolean {
    return geminiService.isAvailable() && 
           !!(navigator.mediaDevices && window.AudioContext) &&
           !!window.electronAPI?.saveAudioFile;
  }

  get isStreaming(): boolean {
    return this.isRecording;
  }

  async startRecording(options: GeminiLiveOptions = {}): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    this.options = { ...this.options, ...options };
    this.stats.processingMode = this.options.processingMode;
    this.stats.chunkDurationMs = this.options.chunkDurationMs;

    try {
      console.log('🎤 Starting Unified Gemini Live Transcription...', this.options);
      console.log('🔍 CRASH DEBUG: Step 1 - Starting microphone access...');

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      console.log('🔍 CRASH DEBUG: Step 2 - Microphone access granted, creating AudioContext...');

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      console.log('🔍 CRASH DEBUG: Step 3 - AudioContext created, creating MediaStreamSource...');
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      console.log('🔍 CRASH DEBUG: Step 4 - MediaStreamSource created, creating ScriptProcessor...');
      
      // Create processor
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      console.log('🔍 CRASH DEBUG: Step 5 - ScriptProcessor created, setting up audio process handler...');
      
      // Add crash detection around the audio process handler
      this.processor.onaudioprocess = (event) => {
        try {
          if (!this.isRecording) return;
          
          const inputData = event.inputBuffer.getChannelData(0);
          if (inputData && inputData.length > 0) {
            this.audioBuffer.push(new Float32Array(inputData));
            
            // Log audio activity periodically (every 100 events to avoid spam)
            if (this.audioBuffer.length % 100 === 0) {
              console.log(`🔍 CRASH DEBUG: Audio processing - buffer size: ${this.audioBuffer.length}, input length: ${inputData.length}`);
            }
          }
        } catch (error) {
          console.error('🔍 CRASH DEBUG: ERROR in onaudioprocess handler:', error);
          this.emitError(error as Error);
        }
      };
      console.log('🔍 CRASH DEBUG: Step 6 - Audio process handler set, connecting audio chain...');

      // Connect audio chain
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      console.log('🔍 CRASH DEBUG: Step 7 - Audio chain connected successfully');

      // Start processing interval based on mode
      if (this.options.processingMode === 'continuous') {
        console.log('🔍 CRASH DEBUG: Step 8 - Setting up continuous processing interval...');
        
        this.processingInterval = window.setInterval(() => {
          try {
            console.log('🔍 CRASH DEBUG: Processing interval triggered, calling processAudioBuffer...');
            this.processAudioBuffer().catch((error) => {
              console.error('🔍 CRASH DEBUG: ERROR in processAudioBuffer from interval:', error);
              this.emitError(error as Error);
            });
          } catch (error) {
            console.error('🔍 CRASH DEBUG: ERROR in processing interval callback:', error);
            this.emitError(error as Error);
          }
        }, this.options.chunkDurationMs);
        
        console.log(`🔍 CRASH DEBUG: Step 9 - Processing interval set up with ${this.options.chunkDurationMs}ms duration`);
      } else {
        console.log('🔍 CRASH DEBUG: Step 8 - Skipping interval setup (send-at-end mode)');
      }

      this.isRecording = true;
      console.log('🔍 CRASH DEBUG: Step 10 - Recording state set to true, updating stats...');
      
      this.updateStats();
      console.log('🔍 CRASH DEBUG: Step 11 - Stats updated successfully');
      
      console.log('✅ Unified Gemini Live Transcription started');
      console.log('🔍 CRASH DEBUG: Step 12 - Startup completed successfully');

    } catch (error) {
      console.error('🔍 CRASH DEBUG: ERROR during startup:', error);
      this.cleanup();
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  async stopRecording(): Promise<GeminiLiveResult[]> {
    if (!this.isRecording) {
      return [];
    }

    console.log('🛑 Stopping Unified Gemini Live Transcription...');
    this.isRecording = false;

    // Clear processing interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    let results: GeminiLiveResult[] = [];

    try {
      // Process any remaining audio buffer
      if (this.audioBuffer.length > 0) {
        console.log('📝 Processing final audio buffer...');
        await this.processAudioBuffer();
      }

      // In 'send-at-end' mode, process all collected chunks now
      if (this.options.processingMode === 'send-at-end') {
        console.log('📤 Processing all audio chunks at end...');
        results = await this.processAllChunks();
      }

      // Cleanup temporary files
      await this.cleanupTempFiles();

    } catch (error) {
      console.error('❌ Error during stop recording:', error);
      this.emitError(error as Error);
    } finally {
      this.cleanup();
      this.updateStats();
    }

    console.log(`✅ Recording stopped. Processed ${results.length} chunks.`);
    return results;
  }

  private async processAudioBuffer(): Promise<void> {
    console.log('🔍 CRASH DEBUG: processAudioBuffer called, checking buffer...');
    
    if (this.audioBuffer.length === 0) {
      console.log('🔍 CRASH DEBUG: Audio buffer is empty, returning early');
      return;
    }

    try {
      console.log(`🔍 CRASH DEBUG: Processing audio buffer with ${this.audioBuffer.length} chunks`);
      
      // Combine audio chunks
      const totalLength = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`🔍 CRASH DEBUG: Total audio length: ${totalLength} samples`);
      
      if (totalLength < 8000) { // Less than 0.5 seconds at 16kHz
        console.log('🔍 CRASH DEBUG: Audio too short, skipping processing');
        return;
      }

      console.log('🔍 CRASH DEBUG: Creating combined buffer...');
      const combinedBuffer = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of this.audioBuffer) {
        combinedBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      console.log('🔍 CRASH DEBUG: Combined buffer created successfully');

      // Clear buffer
      this.audioBuffer = [];
      console.log('🔍 CRASH DEBUG: Audio buffer cleared');

      // Save as temporary audio file (reusing proven file-based approach)
      console.log('🔍 CRASH DEBUG: Calling saveAudioChunk...');
      const audioChunk = await this.saveAudioChunk(combinedBuffer);
      console.log('🔍 CRASH DEBUG: saveAudioChunk completed:', audioChunk ? 'success' : 'failed');
      
      if (audioChunk) {
        this.audioChunks.push(audioChunk);
        this.stats.audioChunksCollected++;
        console.log(`🔍 CRASH DEBUG: Audio chunk added, total chunks: ${this.audioChunks.length}`);
        
        this.updateStats();
        console.log('🔍 CRASH DEBUG: Stats updated after chunk');

        // In continuous mode, process immediately
        if (this.options.processingMode === 'continuous') {
          console.log('🔍 CRASH DEBUG: Continuous mode - calling processChunk...');
          await this.processChunk(audioChunk);
          console.log('🔍 CRASH DEBUG: processChunk completed successfully');
        }
      }

    } catch (error) {
      console.error('🔍 CRASH DEBUG: ERROR in processAudioBuffer:', error);
      console.error('🔍 CRASH DEBUG: Error stack:', error.stack);
      this.emitError(error as Error);
    }
  }

  private async saveAudioChunk(audioBuffer: Float32Array): Promise<AudioChunk | null> {
    try {
      console.log('🔍 CRASH DEBUG: saveAudioChunk called, creating WAV buffer...');
      
      // Convert to WAV buffer (reusing file-based approach)
      const wavBuffer = this.createWavBuffer(audioBuffer, 16000, 1);
      console.log(`🔍 CRASH DEBUG: WAV buffer created, size: ${wavBuffer.byteLength} bytes`);
      
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (!electronAPI?.saveAudioFile) {
        throw new Error('Electron saveAudioFile API not available');
      }
      console.log('🔍 CRASH DEBUG: Electron API available, saving file...');

      const fileName = `gemini_live_chunk_${this.tempFileCounter++}_${Date.now()}`;
      console.log(`🔍 CRASH DEBUG: Saving file with name: ${fileName}`);
      
      const result = await electronAPI.saveAudioFile(wavBuffer, fileName, ['wav']);
      console.log('🔍 CRASH DEBUG: saveAudioFile result:', result);
      
      if (result.success && result.files && result.files.length > 0) {
        const wavFile = result.files.find((f: { format: string; path: string }) => f.format === 'wav');
        const filePath = wavFile ? wavFile.path : result.files[0].path;
        console.log(`🔍 CRASH DEBUG: File saved successfully: ${filePath}`);

        return {
          timestamp: Date.now(),
          filePath: filePath,
          size: wavBuffer.byteLength,
          duration: audioBuffer.length / 16000 // Duration in seconds
        };
      } else {
        console.error('🔍 CRASH DEBUG: Failed to save audio chunk:', result.error);
        return null;
      }

    } catch (error) {
      console.error('🔍 CRASH DEBUG: ERROR in saveAudioChunk:', error);
      console.error('🔍 CRASH DEBUG: Error stack:', error.stack);
      return null;
    }
  }

  private async processChunk(chunk: AudioChunk): Promise<void> {
    try {
      console.log(`🔍 CRASH DEBUG: processChunk called for: ${chunk.filePath}`);
      console.log(`🔍 CRASH DEBUG: Processing audio chunk: ${chunk.filePath}`);
      const startTime = Date.now();

      console.log('🔍 CRASH DEBUG: Calling geminiService.transcribeAudio...');
      // Use existing proven Gemini transcribeAudio method
      const result: GeminiTranscriptionResult = await geminiService.transcribeAudio(
        chunk.filePath, 
        this.options.maxSpeakers
      );
      console.log('🔍 CRASH DEBUG: geminiService.transcribeAudio completed');

      const processingTime = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTime;
      this.stats.chunksProcessed++;
      this.stats.lastProcessedTime = Date.now();
      console.log(`🔍 CRASH DEBUG: Stats updated, processing time: ${processingTime}ms`);
      
      this.updateStats();
      console.log('🔍 CRASH DEBUG: updateStats completed');

      if (result.transcript && result.transcript.trim()) {
        console.log('🔍 CRASH DEBUG: Got transcript, updating speaker context...');
        // Update speaker context
        this.updateSpeakerContext(result.speakers);
        console.log('🔍 CRASH DEBUG: Speaker context updated');

        const liveResult: GeminiLiveResult = {
          transcript: result.transcript,
          isFinal: true, // Gemini results are always final
          speakers: result.speakers,
          speakerContext: this.getSpeakerContext(),
          timestamp: chunk.timestamp
        };

        console.log('🔍 CRASH DEBUG: Emitting result...');
        this.emitResult(liveResult);
        console.log(`✅ Transcription result (${processingTime}ms):`, result.transcript);
        console.log('🔍 CRASH DEBUG: Result emitted successfully');
      } else {
        console.log('🔍 CRASH DEBUG: No transcript received from Gemini');
      }

    } catch (error) {
      console.error('🔍 CRASH DEBUG: ERROR in processChunk:', error);
      console.error('🔍 CRASH DEBUG: Error stack:', error.stack);
      this.emitError(error as Error);
    }
  }

  private async processAllChunks(): Promise<GeminiLiveResult[]> {
    const results: GeminiLiveResult[] = [];
    
    for (const chunk of this.audioChunks) {
      try {
        await this.processChunk(chunk);
      } catch (error) {
        console.error(`❌ Error processing chunk in batch:`, error);
      }
    }

    this.audioChunks = [];
    return results;
  }

  private createWavBuffer(audioData: Float32Array, sampleRate: number, channels: number): ArrayBuffer {
    const length = audioData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    // WAV header
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
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // Convert float32 to int16
    const int16Array = new Int16Array(buffer, 44, length);
    for (let i = 0; i < length; i++) {
      int16Array[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
    }

    return buffer;
  }

  private updateSpeakerContext(speakers: Array<{ id: string; name: string; color: string }>): void {
    if (!this.options.enableSpeakerDiarization || !speakers) return;

    const now = Date.now();
    
    for (const speaker of speakers) {
      const existingIndex = this.speakerContext.findIndex(s => s.id === speaker.id);
      
      if (existingIndex >= 0) {
        // Update existing speaker
        this.speakerContext[existingIndex].lastSeen = now;
        this.speakerContext[existingIndex].totalSegments++;
      } else {
        // Add new speaker
        this.speakerContext.push({
          ...speaker,
          lastSeen: now,
          totalSegments: 1
        });
      }
    }

    // Clean up expired speakers
    this.speakerContext = this.speakerContext.filter(
      speaker => (now - speaker.lastSeen) < this.speakerContextTimeout
    );
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (electronAPI?.deleteFile) {
        const deleteResult = await electronAPI.deleteFile(filePath);
        console.log(`🗑️ Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      console.error(`❌ Error cleaning up file ${filePath}:`, error);
    }
  }

  private async cleanupTempFiles(): Promise<void> {
    for (const chunk of this.audioChunks) {
      await this.cleanupFile(chunk.filePath);
    }
    this.audioChunks = [];
  }

  private cleanup(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
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
    this.isRecording = false;
  }

  private updateStats(): void {
    this.stats.isRecording = this.isRecording;
    this.stats.processingMode = this.options.processingMode;
    this.stats.chunkDurationMs = this.options.chunkDurationMs;
    this.stats.currentChunkSize = this.audioBuffer.length;
  }

  private emitResult(result: GeminiLiveResult): void {
    if (this.resultCallback) {
      try {
        this.resultCallback(result);
      } catch (error) {
        console.error('❌ Error in result callback:', error);
      }
    }
  }

  private emitError(error: Error): void {
    if (this.errorCallback) {
      try {
        this.errorCallback(error);
      } catch (callbackError) {
        console.error('❌ Error in error callback:', callbackError);
      }
    }
  }

  // Public API methods
  onResult(callback: (result: GeminiLiveResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  getStats(): GeminiLiveStats {
    return { ...this.stats };
  }

  getSpeakerContext(): Array<{ id: string; name: string; color: string; lastSeen: number; totalSegments: number }> {
    return [...this.speakerContext];
  }

  clearSpeakerContext(): void {
    this.speakerContext = [];
    console.log('🧹 Speaker context cleared');
  }

  setSpeakerContextTimeout(timeoutMs: number): void {
    this.speakerContextTimeout = timeoutMs;
    console.log(`⏰ Speaker context timeout set to ${timeoutMs}ms`);
  }

  destroy(): void {
    this.cleanup();
    this.cleanupTempFiles();
    this.resultCallback = null;
    this.errorCallback = null;
    this.speakerContext = [];
    console.log('🗑️ Unified Gemini Live service destroyed');
  }
}

// Export singleton instance
export const geminiLiveUnified = new GeminiLiveUnifiedService();
export default geminiLiveUnified; 