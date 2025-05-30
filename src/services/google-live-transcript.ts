// Google Live Transcript Service - Semi-Live Recording with Chunking
// Uses semi-live recording infrastructure with chunking intervals

export interface GoogleLiveTranscriptOptions {
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakers?: number;
  encoding?: 'LINEAR16' | 'WEBM_OPUS' | 'MP3';
  sampleRateHertz?: number;
  chunkDurationMs?: number;
  recordingSource?: 'system' | 'mic' | 'both';
}

export interface GoogleLiveTranscriptResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  speakerId?: string;
  speakers?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  timestamp: number;
}

// Interface for Google Speech API response
interface GoogleSpeechAPIResponse {
  results: Array<{
    alternatives: Array<{
      transcript: string;
      confidence: number;
      words?: Array<{
        word: string;
        speakerTag?: number;
      }>;
    }>;
    isFinal?: boolean;
  }>;
}

// Extended ElectronAPI interface for semi-live recording
interface ExtendedElectronAPI {
  // Semi-live recording methods
  startSemiLiveRecording: (options: { 
    chunkDurationMs: number; 
    source: string; 
    filename: string; 
  }) => Promise<{ success: boolean; error?: string }>;
  stopSemiLiveRecording: () => Promise<{ success: boolean; error?: string }>;
  requestSemiLiveChunk: (options: { filename: string }) => Promise<void>;
  onSemiLiveChunk: (callback: (chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }) => void) => void;
  // File operations
  readAudioFile: (path: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  checkFileExists: (path: string) => Promise<boolean>;
}

// Audio chunk interface
interface AudioChunk {
  timestamp: number;
  filePath: string;
  size: number;
  chunkIndex: number;
}

// Processing state for semi-live recording
interface ProcessingState {
  isRecording: boolean;
  chunkDurationMs: number;
  recordingSource: string;
  audioChunks: AudioChunk[];
  lastProcessedTime: number;
  totalChunksProcessed: number;
  chunkCounter: number;
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakers?: number;
  encoding?: 'LINEAR16' | 'WEBM_OPUS' | 'MP3';
  sampleRateHertz?: number;
}

class GoogleLiveTranscriptService {
  private state: ProcessingState = {
    isRecording: false,
    chunkDurationMs: 3000, // Changed from 1000 to 3000 (3 seconds) for better audio capture
    recordingSource: 'mic',
    audioChunks: [],
    lastProcessedTime: 0,
    totalChunksProcessed: 0,
    chunkCounter: 0
  };
  
  private apiKey: string | null = null;
  private chunkingInterval: number | null = null;
  
  private resultCallback: ((result: GoogleLiveTranscriptResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  constructor() {
    console.log('🏗️ Google Live: Constructor called - initializing service...');
    this.checkApiKey();
    this.setupElectronListeners();
    console.log('🏗️ Google Live: Constructor complete');
  }

  private checkApiKey() {
    // Try to get API key from electron environment
    const electronWindow = window as unknown as { electronAPI?: { env?: { GOOGLE_SPEECH_API_KEY?: string } } };
    this.apiKey = electronWindow.electronAPI?.env?.GOOGLE_SPEECH_API_KEY || null;
    
    if (!this.apiKey) {
      console.warn('Google Speech API key not found in environment');
    } else {
      console.log('✅ Google Live: API key found');
    }
  }

  private setupElectronListeners(): void {
    // Setup listeners for semi-live recording events
    if (typeof window !== 'undefined' && window.electronAPI) {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (electronAPI.onSemiLiveChunk) {
        electronAPI.onSemiLiveChunk((chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }) => {
          this.handleChunkReady(chunkData);
        });
      }
    }
  }

  private setupChunkingInterval(): void {
    if (this.chunkingInterval) {
      clearInterval(this.chunkingInterval);
    }

    console.log(`🔄 Google Live: Setting up ${this.state.chunkDurationMs}ms chunking interval`);

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
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (electronAPI.requestSemiLiveChunk) {
        // Use simple chunk filename - let the recording system handle the full naming
        const chunkFilename = `chunk_${this.state.chunkCounter++}`;
        console.log(`🔄 Google Live: Requesting chunk: ${chunkFilename}`);
        await electronAPI.requestSemiLiveChunk({ filename: chunkFilename });
      }
    } catch (error) {
      console.error('❌ Google Live: Error requesting chunk:', error);
      if (this.errorCallback) {
        this.errorCallback(error as Error);
      }
    }
  }

  private async handleChunkReady(chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }): Promise<void> {
    if (!this.state.isRecording) return;

    console.log(`📁 Google Live: Chunk ready: ${chunkData.filePath} (${(chunkData.size / 1024).toFixed(1)} KB)`);

    const chunk: AudioChunk = {
      timestamp: chunkData.timestamp,
      filePath: chunkData.filePath,
      size: chunkData.size,
      chunkIndex: chunkData.chunkIndex
    };

    this.state.audioChunks.push(chunk);

    // Process chunk immediately
    await this.processAudioChunk(chunk);
  }

  private async processAudioChunk(chunk: AudioChunk): Promise<void> {
    console.log(`🔄 Google Live: processAudioChunk called for: ${chunk.filePath}`);
    
    // Check if we have the necessary configuration and API key
    if (!this.state.isRecording || !this.apiKey || !this.state.languageCode) {
      console.warn('⚠️ Google Live: Missing recording state, API key, or language config, skipping chunk processing');
      return;
    }

    try {
      console.log(`🔄 Google Live: Processing audio chunk: ${chunk.filePath}`);

      // Read the audio file
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      console.log(`📖 Google Live: Reading audio file: ${chunk.filePath}`);
      const audioResult = await electronAPI.readAudioFile(chunk.filePath);
      
      if (!audioResult.success || !audioResult.buffer) {
        console.warn(`⚠️ Failed to read audio file: ${audioResult.error}`);
        return;
      }

      console.log(`📖 Google Live: Successfully read audio file, buffer size: ${audioResult.buffer.byteLength} bytes`);

      // Convert ArrayBuffer to base64 for Google Speech API
      console.log(`🔄 Google Live: Converting audio buffer to base64...`);
      const audioData = this.arrayBufferToBase64(audioResult.buffer);
      console.log(`🔄 Google Live: Base64 conversion complete, length: ${audioData.length} characters`);

      // Call Google Speech API
      console.log(`🌐 Google Live: Calling Google Speech API...`);
      const transcriptionResult = await this.callGoogleSpeechAPI(audioData);
      
      if (transcriptionResult) {
        console.log('🎯 Google Live: Received transcription result:', transcriptionResult);
        console.log('📡 Google Live: Calling result callback...');
        this.resultCallback?.(transcriptionResult);
      } else {
        console.log('🤐 Google Live: No transcription result from API call');
      }

      // Remove chunk from pending list and cleanup file
      this.state.audioChunks = this.state.audioChunks.filter(c => c.filePath !== chunk.filePath);
      this.state.totalChunksProcessed++;
      console.log(`📊 Google Live: Chunk processing complete. Total processed: ${this.state.totalChunksProcessed}`);

    } catch (error) {
      console.error(`❌ Error processing audio chunk ${chunk.filePath}:`, error);
      if (this.errorCallback) {
        this.errorCallback(error as Error);
      }
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    
    return btoa(binary);
  }

  private async callGoogleSpeechAPI(audioData: string): Promise<GoogleLiveTranscriptResult | null> {
    if (!this.apiKey) {
      console.error('❌ Google Live: No API key available');
      return null;
    }

    // Check if service is still active before processing
    if (!this.state.isRecording) {
      console.log('🔇 Google Live: Service stopped, skipping chunk processing');
      return null;
    }

    try {
      console.log('🔍 Google Live: Calling Speech API for transcription with config:', {
        encoding: this.state.encoding,
        sampleRateHertz: this.state.sampleRateHertz,
        languageCode: this.state.languageCode,
        enableSpeakerDiarization: this.state.enableSpeakerDiarization,
        maxSpeakers: this.state.maxSpeakers
      });

      const requestBody = {
        config: {
          encoding: this.state.encoding,
          sampleRateHertz: this.state.sampleRateHertz,
          languageCode: this.state.languageCode,
          model: 'latest_long',
          useEnhanced: true,
          enableAutomaticPunctuation: true,
          // Correct diarization configuration structure
          diarizationConfig: {
            enableSpeakerDiarization: this.state.enableSpeakerDiarization,
            minSpeakerCount: 1,
            maxSpeakerCount: this.state.maxSpeakers
          }
        },
        audio: {
          content: audioData
        }
      };

      const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      console.log(`🌐 Google Live: API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Google Live: API error response:`, errorText);
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`📥 Google Live: API response data:`, data);
      
      if (!data.results || data.results.length === 0) {
        console.log('🤐 No transcription results from Google Speech API');
        return null;
      }

      const result = this.parseGoogleResponse(data);
      console.log(`✅ Google Live: Transcription result: "${result.transcript}"`);
      return result;

    } catch (error) {
      console.error('❌ Google Speech API error:', error);
      return null;
    }
  }

  private parseGoogleResponse(data: GoogleSpeechAPIResponse): GoogleLiveTranscriptResult {
    const result = data.results[0];
    const alternative = result.alternatives[0];
    
    let transcript = alternative.transcript || '';
    const confidence = alternative.confidence || 0;
    const speakers: Array<{ id: string; name: string; color: string }> = [];
    const colors = ["#28C76F", "#7367F0", "#FF9F43", "#EA5455", "#00CFE8", "#9F44D3"];

    // Handle speaker diarization if available
    if (alternative.words) {
      const speakerMap = new Map<number, string>();
      let speakerId: string | undefined;

      // Build speaker transcript
      let speakerTranscript = '';
      let currentSpeaker: number | undefined;

      for (const wordInfo of alternative.words) {
        const speaker = wordInfo.speakerTag || 1;
        
        if (speaker !== currentSpeaker) {
          if (currentSpeaker !== undefined) {
            speakerTranscript += '\n';
          }
          currentSpeaker = speaker;
          speakerTranscript += `Speaker ${speaker}: `;
          
          if (!speakerMap.has(speaker)) {
            speakerMap.set(speaker, `Speaker ${speaker}`);
            speakers.push({
              id: speaker.toString(),
              name: `Speaker ${speaker}`,
              color: colors[speaker % colors.length]
            });
          }
        }
        
        speakerTranscript += wordInfo.word + ' ';
        speakerId = speaker.toString();
      }

      if (speakerTranscript) {
        transcript = speakerTranscript.trim();
      }
    }

    return {
      transcript: transcript.trim(),
      isFinal: result.isFinal || true,
      confidence,
      speakerId: speakers.length > 0 ? speakers[0].id : undefined,
      speakers: speakers.length > 0 ? speakers : undefined,
      timestamp: Date.now()
    };
  }

  get isAvailable(): boolean {
    const electronAPI = (window as unknown as { electronAPI?: ExtendedElectronAPI })?.electronAPI;
    const hasElectronAPI = !!(electronAPI?.startSemiLiveRecording);
    return !!(this.apiKey && hasElectronAPI);
  }

  get isStreaming(): boolean {
    return this.state.isRecording;
  }

  get transcript(): string {
    // For compatibility with existing hook
    return '';
  }

  get speakers(): Array<{ id: string; name: string; color: string }> {
    // For compatibility with existing hook
    return [];
  }

  get error(): string | null {
    // For compatibility with existing hook
    return null;
  }

  async startRecording(options: GoogleLiveTranscriptOptions = {}): Promise<void> {
    console.log('🎤 Google Live: startRecording called with options:', options);
    
    if (!this.isAvailable) {
      console.error('❌ Google Live: Service not available');
      console.log('❌ Google Live: API key available:', !!this.apiKey);
      console.log('❌ Google Live: Electron API available:', !!(window as unknown as { electronAPI?: ExtendedElectronAPI })?.electronAPI);
      throw new Error('Google Live Transcript not available - check API key and Electron environment');
    }

    if (this.state.isRecording) {
      console.warn('⚠️ Google Live: Already recording');
      return;
    }

    // Clear any previous state
    this.clearTranscript();
    this.speakers.splice(0); // Clear speakers array properly

    const opts = {
      languageCode: 'en-US',
      enableSpeakerDiarization: true,
      maxSpeakers: 4,
      encoding: 'MP3' as const, // Changed from LINEAR16 to MP3 to match generated files
      sampleRateHertz: 44100,   // Changed from 16000 to 44100 for MP3
      chunkDurationMs: 3000, // Changed from 1000 to 3000 (3 seconds) for better audio capture
      recordingSource: 'mic' as const,
      ...options
    };

    // Store all options in state for chunk processing
    this.state = {
      isRecording: true,
      chunkDurationMs: opts.chunkDurationMs,
      recordingSource: opts.recordingSource,
      audioChunks: [],
      lastProcessedTime: 0,
      totalChunksProcessed: 0,
      chunkCounter: 0,
      languageCode: opts.languageCode,
      enableSpeakerDiarization: opts.enableSpeakerDiarization,
      maxSpeakers: opts.maxSpeakers,
      encoding: opts.encoding,
      sampleRateHertz: opts.sampleRateHertz
    };

    console.log('🎤 Google Live: Final options:', opts);

    // Generate a unique recording ID
    const recordingId = `google_live_${Date.now()}`;
    console.log('🎤 Google Live: Generated recording ID:', recordingId);

    console.log('🎤 Starting Google Live Transcript with semi-live recording...');

    try {
      // Start semi-live recording
      console.log('🎤 Google Live: Starting mic recording...');
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      const result = await electronAPI.startSemiLiveRecording({
        chunkDurationMs: opts.chunkDurationMs,
        source: opts.recordingSource,
        filename: recordingId
      });

      console.log('🎤 Google Live: Recording start result:', result);

      if (result && result.success) {
        console.log('✅ Google Live Transcript started with semi-live recording');
        console.log('📊 Google Live: Final state after start:', this.state);
        
        // Start requesting chunks
        this.setupChunkingInterval();
      } else {
        throw new Error('Failed to start semi-live recording');
      }
    } catch (error) {
      console.error('❌ Google Live: Error starting recording:', error);
      this.state.isRecording = false;
      throw error;
    }
  }

  stopRecording(): void {
    if (!this.state.isRecording) return;

    console.log('🛑 Stopping Google Live Transcript...');

    this.state.isRecording = false;

    // Clear chunking interval
    if (this.chunkingInterval) {
      clearInterval(this.chunkingInterval);
      this.chunkingInterval = null;
      console.log('🔄 Google Live: Chunking interval cleared');
    }

    // Stop the semi-live recording
    const electronAPI = window.electronAPI as ExtendedElectronAPI;
    electronAPI.stopSemiLiveRecording().catch((error: Error) => {
      console.warn('Error stopping recording:', error);
    });

    // Reset state
    this.state.audioChunks = [];

    console.log('✅ Google Live Transcript stopped');
  }

  clearTranscript(): void {
    // For compatibility with existing hook - this service doesn't accumulate transcript
    console.log('🧹 Google Live: Clear transcript called (no-op for file-based service)');
  }

  onResult(callback: (result: GoogleLiveTranscriptResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  // Stats for debugging
  getStats() {
    return {
      isRecording: this.state.isRecording,
      totalChunksProcessed: this.state.totalChunksProcessed,
      lastProcessedTime: this.state.lastProcessedTime,
      chunkDurationMs: this.state.chunkDurationMs,
      recordingSource: this.state.recordingSource,
      processedFilesCount: this.state.audioChunks.length
    };
  }

  // Debug method to check status
  debugStatus() {
    console.log('🔍 Google Live: Debug status...');
    const electronAPI = window.electronAPI as ExtendedElectronAPI;
    console.log('🔍 electronAPI available:', !!electronAPI);
    console.log('🔍 API key available:', !!this.apiKey);
    console.log('🔍 Current state:', this.state);
  }
}

// Export singleton
export const googleLiveTranscript = new GoogleLiveTranscriptService();

// Add debug access to the singleton
(window as unknown as { __debugGoogleLive?: () => void }).__debugGoogleLive = googleLiveTranscript.debugStatus.bind(googleLiveTranscript);

export default googleLiveTranscript; 