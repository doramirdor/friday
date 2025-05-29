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
  private mediaRecorder: MediaRecorder | null = null;
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

  // Audio chunks for processing (storing Blobs temporarily)
  private audioBlobs: Blob[] = [];
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

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // Use MediaRecorder instead of ScriptProcessor to avoid crashes
      console.log('🔄 Using MediaRecorder instead of ScriptProcessor...');
      
      // Find supported audio format
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm', 
        'audio/mp4',
        'audio/wav'
      ];
      
      let mimeType = '';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 128000
      });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.isRecording) {
          this.audioBlobs.push(event.data);
        }
      };
      
      // Start recording with chunk intervals
      this.mediaRecorder.start(this.options.chunkDurationMs);

      // Start processing interval based on mode
      if (this.options.processingMode === 'continuous') {
        this.processingInterval = window.setInterval(() => {
          this.processAccumulatedChunks();
        }, this.options.chunkDurationMs);
      }

      this.isRecording = true;
      console.log('✅ Unified Gemini Live Transcription started with MediaRecorder');

    } catch (error) {
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
      if (this.audioBlobs.length > 0) {
        console.log('📝 Processing final audio buffer...');
        results = await this.processAllBlobs();
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

  private async processAccumulatedChunks(): Promise<void> {
    try {
      console.log('📝 Processing accumulated audio chunks...');
      console.log(`📊 Audio blobs to process: ${this.audioBlobs.length}`);
      
      if (!this.audioBlobs || this.audioBlobs.length === 0) {
        console.log('No audio blobs to process, returning early');
        return;
      }

      // Process each blob individually instead of combining them
      for (const blob of this.audioBlobs) {
        if (blob.size < 1000) { // Skip very small blobs (less than 1KB)
          console.log('Skipping small audio blob');
          continue;
        }

        try {
          console.log(`Processing blob of size: ${blob.size} bytes`);
          const arrayBuffer = await blob.arrayBuffer();
          const audioChunk = await this.saveAudioChunk(arrayBuffer);
          
          if (audioChunk) {
            this.audioChunks.push(audioChunk);
            this.stats.audioChunksCollected++;
            
            // In continuous mode, process immediately
            if (this.options.processingMode === 'continuous') {
              await this.processChunk(audioChunk);
            }
          }
        } catch (error) {
          console.error('Error processing individual blob:', error);
        }
      }

      // Clear processed blobs
      this.audioBlobs = [];
      this.updateStats();
      console.log('✅ Accumulated chunks processed');

    } catch (error) {
      console.error('ERROR in processAccumulatedChunks:', error);
      this.emitError(error as Error);
    }
  }

  private async saveAudioChunk(audioBuffer: ArrayBuffer): Promise<AudioChunk | null> {
    try {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (!electronAPI?.saveAudioFile) {
        throw new Error('Electron saveAudioFile API not available');
      }

      const fileName = `gemini_live_chunk_${this.tempFileCounter++}_${Date.now()}`;
      const result = await electronAPI.saveAudioFile(audioBuffer, fileName, ['wav']);
      
      if (result.success && result.files && result.files.length > 0) {
        const wavFile = result.files.find((f: { format: string; path: string }) => f.format === 'wav');
        const filePath = wavFile ? wavFile.path : result.files[0].path;

        return {
          timestamp: Date.now(),
          filePath: filePath,
          size: audioBuffer.byteLength,
          duration: audioBuffer.byteLength / (16000 * 2) // Approximate duration based on 16kHz, 16-bit
        };
      } else {
        console.error('Failed to save audio chunk:', result.error);
        return null;
      }

    } catch (error) {
      console.error('Error in saveAudioChunk:', error);
      return null;
    }
  }

  private async processChunk(chunk: AudioChunk): Promise<void> {
    try {
      console.log(`📝 Processing audio chunk: ${chunk.filePath}`);
      const startTime = Date.now();

      // Use existing proven Gemini transcribeAudio method
      const result: GeminiTranscriptionResult = await geminiService.transcribeAudio(
        chunk.filePath, 
        this.options.maxSpeakers
      );

      const processingTime = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTime;
      this.stats.chunksProcessed++;
      this.stats.lastProcessedTime = Date.now();
      
      this.updateStats();

      if (result.transcript && result.transcript.trim()) {
        // Update speaker context
        this.updateSpeakerContext(result.speakers);

        const liveResult: GeminiLiveResult = {
          transcript: result.transcript,
          isFinal: true, // Gemini results are always final
          speakers: result.speakers,
          speakerContext: this.getSpeakerContext(),
          timestamp: chunk.timestamp
        };

        this.emitResult(liveResult);
        console.log(`✅ Transcription result (${processingTime}ms):`, result.transcript);
      } else {
        console.log('🔇 No transcript received from Gemini');
      }

    } catch (error) {
      console.error('❌ Error in processChunk:', error);
      this.emitError(error as Error);
    }
  }

  private async processAllBlobs(): Promise<GeminiLiveResult[]> {
    const results: GeminiLiveResult[] = [];
    
    for (const blob of this.audioBlobs) {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const chunk = await this.saveAudioChunk(arrayBuffer);
        if (chunk) {
          await this.processChunk(chunk);
        }
      } catch (error) {
        console.error(`❌ Error processing chunk in batch:`, error);
      }
    }

    this.audioBlobs = [];
    return results;
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

    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.isRecording = false;
  }

  private updateStats(): void {
    this.stats.isRecording = this.isRecording;
    this.stats.processingMode = this.options.processingMode;
    this.stats.chunkDurationMs = this.options.chunkDurationMs;
    this.stats.currentChunkSize = this.audioChunks.length;
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