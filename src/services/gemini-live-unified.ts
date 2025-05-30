// Import types
import geminiService, { GeminiTranscriptionResult } from './gemini';
import { Speaker } from '@/models/types';

// Unified Gemini Live Transcription Service
// Captures audio using MediaRecorder, saves as temporary files, and transcribes using Gemini 2.0 Flash

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
  audioBuffer: ArrayBuffer;
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
      
      // Initialize MediaRecorder with proper format detection
      await this.initializeMediaRecorder(this.mediaStream);

      // Start recording with chunk intervals
      this.mediaRecorder!.start(this.options.chunkDurationMs);

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
      console.log('🔍 Saving audio chunk as temporary file for Gemini transcription...');
      console.log('🔍 Audio buffer size:', audioBuffer.byteLength, 'bytes');
      
      // Get the actual MIME type that MediaRecorder is using (not what we requested)
      const actualMimeType = this.mediaRecorder?.mimeType || 'audio/mp3';
      console.log('🔍 MediaRecorder actual MIME type:', actualMimeType);
      
      let fileExtension = 'mp3'; // Default fallback for Gemini compatibility
      let saveFormat = 'mp3'; // What to tell saveAudioFile to convert to
      
      // Check if MediaRecorder is actually producing a Gemini-compatible format
      const isGeminiCompatible = 
        actualMimeType.includes('mp3') || 
        actualMimeType.includes('mpeg') ||
        actualMimeType.includes('wav') ||
        actualMimeType.includes('aac') ||
        actualMimeType.includes('ogg') ||
        actualMimeType.includes('flac');
      
      if (isGeminiCompatible) {
        console.log('✅ MediaRecorder format is Gemini-compatible:', actualMimeType);
        // Map to appropriate file extension
        if (actualMimeType.includes('mp3') || actualMimeType.includes('mpeg')) {
          fileExtension = 'mp3';
          saveFormat = 'mp3';
        } else if (actualMimeType.includes('wav')) {
          fileExtension = 'wav';
          saveFormat = 'wav';
        } else if (actualMimeType.includes('ogg')) {
          fileExtension = 'ogg';
          saveFormat = 'ogg';
        } else if (actualMimeType.includes('aac')) {
          fileExtension = 'aac';
          saveFormat = 'aac';
        }
      } else {
        console.warn('⚠️ MediaRecorder format is NOT Gemini-compatible:', actualMimeType);
        console.log('🔄 Will request conversion to MP3 for Gemini compatibility');
        // Force conversion to MP3 regardless of input format
        fileExtension = 'mp3';
        saveFormat = 'mp3';
      }
      
      // Create a temporary filename with correct extension
      const timestamp = Date.now();
      const filename = `live-chunk-${this.tempFileCounter++}-${timestamp}.${fileExtension}`;
      
      console.log('🔍 Saving audio chunk:');
      console.log(`  Original format: ${actualMimeType}`);
      console.log(`  Filename: ${filename}`);
      console.log(`  Requested save format: ${saveFormat}`);
      console.log(`  Gemini compatible: ${isGeminiCompatible}`);

      // Save audio buffer as temporary file using existing IPC
      const electronAPI = window.electronAPI;
      if (electronAPI?.saveAudioFile) {
        const saveResult = await electronAPI.saveAudioFile(audioBuffer, filename, [saveFormat]);
        
        if (saveResult.success && saveResult.files && saveResult.files.length > 0) {
          const savedFile = saveResult.files[0]; // Get the first saved file
          console.log('✅ Audio chunk saved successfully:');
          console.log(`  File path: ${savedFile.path}`);
          console.log(`  File format: ${savedFile.format}`);
          console.log(`  Expected for Gemini: ${saveFormat}`);
          
          return {
            timestamp: timestamp,
            filePath: savedFile.path,
            size: audioBuffer.byteLength,
            duration: audioBuffer.byteLength / (16000 * 2), // Approximate duration
            audioBuffer: audioBuffer
          };
        } else {
          console.error('❌ Failed to save audio chunk:', saveResult.error || 'No files saved');
          console.log('🔄 Falling back to mock transcription due to file saving failure');
          
          // Return a mock chunk that will generate a mock transcription result
          return {
            timestamp: timestamp,
            filePath: `mock-chunk-${this.tempFileCounter}-${timestamp}.${fileExtension}`,
            size: audioBuffer.byteLength,
            duration: audioBuffer.byteLength / (16000 * 2),
            audioBuffer: audioBuffer
          };
        }
      } else {
        console.error('❌ saveAudioFile API not available');
        return null;
      }

    } catch (error) {
      console.error('❌ Exception in saveAudioChunk:', error);
      return null;
    }
  }

  private async processChunk(chunk: AudioChunk): Promise<void> {
    try {
      console.log(`📝 Processing audio chunk: ${chunk.filePath}`);
      console.log(`🔍 GEMINI DEBUG: File path: ${chunk.filePath}`);
      console.log(`🔍 GEMINI DEBUG: File size: ${chunk.size} bytes`);
      console.log(`🔍 GEMINI DEBUG: Duration: ${chunk.duration} seconds`);
      console.log(`🔍 GEMINI DEBUG: Max speakers: ${this.options.maxSpeakers}`);
      
      // Check if chunk has enough audio content for transcription
      const minSizeBytes = 5000; // Minimum 5KB for meaningful audio
      const minDurationSeconds = 0.5; // Minimum 0.5 seconds
      
      if (chunk.size < minSizeBytes || chunk.duration < minDurationSeconds) {
        console.log(`⚠️ GEMINI DEBUG: Skipping chunk - too small (${chunk.size} bytes, ${chunk.duration}s)`);
        console.log(`  Minimum requirements: ${minSizeBytes} bytes, ${minDurationSeconds} seconds`);
        return;
      }
      
      const startTime = Date.now();

      console.log('🔍 GEMINI DEBUG: 🚀 Calling real Gemini API with saved audio file...');
      console.log('🔍 GEMINI DEBUG: Request details:', {
        filePath: chunk.filePath,
        size: chunk.size,
        duration: chunk.duration,
        maxSpeakers: this.options.maxSpeakers,
        timestamp: new Date().toISOString()
      });

      // Check if this is a mock chunk (file saving failed) or real file
      if (chunk.filePath.startsWith('mock-chunk-')) {
        console.log('🔍 GEMINI DEBUG: Processing mock chunk due to file saving failure');
        
        // Provide mock transcription result
        const result: GeminiTranscriptionResult = {
          transcript: `[${new Date().toLocaleTimeString()}] Live transcription chunk ${this.stats.chunksProcessed + 1} - ${(chunk.size / 1024).toFixed(1)}KB audio processed (file saving failed, using mock)`,
          speakers: [
            { 
              id: "1", 
              name: "Speaker 1", 
              color: "#28C76F",
              meetingId: "live-unified-session",
              type: "speaker"
            }
          ]
        };

        const processingTime = Date.now() - startTime;
        console.log(`🔍 GEMINI DEBUG: ✅ Using mock result (${processingTime}ms)`);
        
        this.stats.totalProcessingTime += processingTime;
        this.stats.chunksProcessed++;
        this.stats.lastProcessedTime = Date.now();
        this.updateStats();

        if (result.transcript && result.transcript.trim()) {
          this.updateSpeakerContext(result.speakers);
          const liveResult: GeminiLiveResult = {
            transcript: result.transcript,
            isFinal: true,
            speakers: result.speakers,
            speakerContext: this.getSpeakerContext(),
            timestamp: chunk.timestamp
          };
          this.emitResult(liveResult);
          console.log(`✅ Mock transcription result (${processingTime}ms):`, result.transcript);
        }
        return;
      }

      // Check if Gemini service is available
      if (!geminiService.isAvailable()) {
        throw new Error('Gemini AI is not initialized. Please check your API key.');
      }

      // Use the existing stable geminiService.transcribeAudio() method with the saved file
      const result: GeminiTranscriptionResult = await geminiService.transcribeAudio(
        chunk.filePath,
        this.options.maxSpeakers
      );

      const processingTime = Date.now() - startTime;
      console.log(`🔍 GEMINI DEBUG: ✅ Received response from Gemini API (${processingTime}ms)`);
      console.log('🔍 GEMINI DEBUG: Response details:', {
        transcript: result.transcript?.substring(0, 100) + (result.transcript?.length > 100 ? '...' : ''),
        transcriptLength: result.transcript?.length || 0,
        speakers: result.speakers?.map(s => ({ id: s.id, name: s.name, color: s.color })) || [],
        speakerCount: result.speakers?.length || 0,
        processingTime: processingTime + 'ms'
      });

      this.stats.totalProcessingTime += processingTime;
      this.stats.chunksProcessed++;
      this.stats.lastProcessedTime = Date.now();
      
      this.updateStats();

      if (result.transcript && result.transcript.trim()) {
        console.log('🔍 GEMINI DEBUG: ✅ Valid transcript received, processing...');
        
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
        console.log('🔍 GEMINI DEBUG: ❌ Empty or invalid transcript:', {
          transcript: result.transcript,
          transcriptType: typeof result.transcript,
          transcriptLength: result.transcript?.length || 0
        });
      }

      // Clean up the temporary file after successful processing
      await this.cleanupFile(chunk.filePath);

    } catch (error) {
      console.error('❌ Error in processChunk:', error);
      console.error('🔍 GEMINI DEBUG: ❌ Gemini API error details:', {
        error: error.message,
        stack: error.stack,
        chunkPath: chunk.filePath,
        chunkSize: chunk.size
      });
      
      // Try to cleanup the file even on error
      try {
        await this.cleanupFile(chunk.filePath);
      } catch (cleanupError) {
        console.error('❌ Error cleaning up failed chunk:', cleanupError);
      }
      
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
      const electronAPI = window.electronAPI;
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

  private async initializeMediaRecorder(stream: MediaStream): Promise<void> {
    console.log('🔍 Initializing MediaRecorder for unified transcription...');
    
    // Check MediaRecorder support for different MIME types
    // Gemini supports: WAV, MP3, AIFF, AAC, OGG, FLAC - NOT WebM!
    const supportedTypes = [
      'audio/mp3',
      'audio/mpeg',
      'audio/wav', 
      'audio/ogg; codecs=opus',
      'audio/aac'
    ];
    
    console.log('🔍 Checking MediaRecorder MIME type support:');
    for (const type of supportedTypes) {
      const isSupported = MediaRecorder.isTypeSupported(type);
      console.log(`  ${type}: ${isSupported ? '✅' : '❌'}`);
    }
    
    let selectedMimeType = 'audio/mp3'; // Default fallback
    
    for (const mimeType of supportedTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        console.log(`✅ Selected MIME type: ${mimeType}`);
        break;
      }
    }
    
    if (!supportedTypes.some(type => MediaRecorder.isTypeSupported(type))) {
      console.warn('⚠️ No preferred audio formats supported by MediaRecorder');
      // Check what MediaRecorder actually supports
      const commonTypes = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/wav',
        'audio/ogg'
      ];
      console.log('🔍 MediaRecorder fallback format support:');
      for (const type of commonTypes) {
        console.log(`  ${type}: ${MediaRecorder.isTypeSupported(type) ? '✅' : '❌'}`);
      }
    }

    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        bitsPerSecond: 128000 // 128kbps for good quality
      });

      // Log what MediaRecorder actually decided to use
      console.log(`✅ MediaRecorder initialized successfully`);
      console.log(`🔍 Requested MIME type: ${selectedMimeType}`);
      console.log(`🔍 Actual MediaRecorder mimeType: ${this.mediaRecorder.mimeType}`);
      console.log(`🔍 MediaRecorder state: ${this.mediaRecorder.state}`);
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          console.log(`📊 Audio chunk received: ${event.data.size} bytes`);
          console.log(`🔍 Blob type: ${event.data.type}`);
          console.log(`🔍 MediaRecorder mimeType: ${this.mediaRecorder?.mimeType}`);
          this.audioBlobs.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event);
        this.emitError(new Error('MediaRecorder error occurred'));
      };

    } catch (error) {
      console.error('❌ Failed to initialize MediaRecorder:', error);
      throw new Error(`Failed to initialize MediaRecorder: ${error.message}`);
    }
  }
}

// Export singleton instance
export const geminiLiveUnified = new GeminiLiveUnifiedService();
export default geminiLiveUnified; 