// Google Live Transcript Service - File-based approach for stability
// Uses Electron recording infrastructure to save 1-second audio chunks and send to Google Speech API

export interface GoogleLiveTranscriptOptions {
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakers?: number;
  encoding?: 'LINEAR16' | 'WEBM_OPUS';
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
  onSemiLiveChunk?: (callback: (chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }) => void) => void;
}

// Audio chunk interface for file-based recording
interface AudioChunk {
  timestamp: number;
  filePath: string;
  size: number;
  chunkIndex: number;
}

// Processing state for file-based recording
interface ProcessingState {
  isRecording: boolean;
  chunkDurationMs: number;
  audioChunks: AudioChunk[];
  lastProcessedTime: number;
  totalChunksProcessed: number;
  chunkCounter: number;
  recordingSource: string;
}

class GoogleLiveTranscriptService {
  private state: ProcessingState = {
    isRecording: false,
    chunkDurationMs: 1000, // 1 second chunks for near real-time
    audioChunks: [],
    lastProcessedTime: 0,
    totalChunksProcessed: 0,
    chunkCounter: 0,
    recordingSource: 'mic'
  };
  
  private currentOptions: GoogleLiveTranscriptOptions | null = null;
  private currentRecordingId: string | null = null;
  private apiKey: string | null = null;
  
  private resultCallback: ((result: GoogleLiveTranscriptResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  constructor() {
    this.checkApiKey();
    this.setupElectronListeners();
  }

  private checkApiKey() {
    // Try to get API key from electron environment
    const electronWindow = window as unknown as { electronAPI?: { env?: { GOOGLE_SPEECH_API_KEY?: string } } };
    this.apiKey = electronWindow.electronAPI?.env?.GOOGLE_SPEECH_API_KEY || null;
    
    if (!this.apiKey) {
      console.warn('Google Speech API key not found in environment');
    }
  }

  private setupElectronListeners(): void {
    // Setup listeners for audio chunk events from Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (electronAPI.onSemiLiveChunk) {
        electronAPI.onSemiLiveChunk((chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }) => {
          this.handleChunkReady(chunkData);
        });
      }
    }
  }

  private async handleChunkReady(chunkData: { filePath: string; timestamp: number; chunkIndex: number; size: number }): Promise<void> {
    if (!this.state.isRecording) return;

    console.log(`🎵 Google Live: Processing audio chunk ${chunkData.chunkIndex}, size: ${chunkData.size} bytes`);

    // Add chunk to our queue
    const audioChunk: AudioChunk = {
      timestamp: chunkData.timestamp,
      filePath: chunkData.filePath,
      size: chunkData.size,
      chunkIndex: chunkData.chunkIndex
    };

    this.state.audioChunks.push(audioChunk);

    // Process the chunk immediately for real-time transcription
    await this.processChunk(audioChunk);
  }

  private async processChunk(chunk: AudioChunk): Promise<void> {
    if (!this.currentOptions || !this.apiKey) return;

    try {
      console.log(`🔄 Google Live: Processing chunk ${chunk.chunkIndex} (${chunk.size} bytes)`);

      // Read the audio file
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      const audioResult = await electronAPI.readAudioFile(chunk.filePath);
      
      if (!audioResult.success || !audioResult.buffer) {
        console.warn(`⚠️ Failed to read audio chunk: ${audioResult.error}`);
        return;
      }

      // Convert ArrayBuffer to base64 for Google Speech API
      const audioData = this.arrayBufferToBase64(audioResult.buffer);

      // Call Google Speech API
      const transcriptionResult = await this.callGoogleSpeechAPI(audioData, this.currentOptions as Required<GoogleLiveTranscriptOptions>);
      
      if (transcriptionResult && this.resultCallback) {
        this.resultCallback(transcriptionResult);
      }

      // Cleanup the chunk file
      try {
        await electronAPI.deleteFile(chunk.filePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup chunk file:', cleanupError);
      }

      this.state.totalChunksProcessed++;
      this.state.lastProcessedTime = Date.now();

    } catch (error) {
      console.error(`❌ Error processing chunk ${chunk.chunkIndex}:`, error);
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

  private async callGoogleSpeechAPI(audioData: string, options: Required<GoogleLiveTranscriptOptions>): Promise<GoogleLiveTranscriptResult | null> {
    try {
      const requestBody = {
        config: {
          encoding: options.encoding,
          sampleRateHertz: options.sampleRateHertz,
          languageCode: options.languageCode,
          enableSpeakerDiarization: options.enableSpeakerDiarization,
          diarizationSpeakerCount: options.maxSpeakers,
          model: 'latest_long',
          useEnhanced: true,
        },
        audio: {
          content: audioData
        }
      };

      console.log(`🔍 Google Live: Calling Speech API for transcription`);

      const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
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
    const hasElectronAPI = !!(window as unknown as { electronAPI?: ExtendedElectronAPI })?.electronAPI?.startSemiLiveRecording;
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
    if (!this.isAvailable) {
      throw new Error('Google Live Transcript not available - check API key and Electron environment');
    }

    if (this.state.isRecording) {
      console.warn('Already recording');
      return;
    }

    const opts = {
      languageCode: 'en-US',
      enableSpeakerDiarization: true,
      maxSpeakers: 4,
      encoding: 'LINEAR16' as const,
      sampleRateHertz: 16000,
      chunkDurationMs: 1000, // 1 second chunks
      recordingSource: 'mic' as const,
      ...options
    };

    this.currentOptions = opts;
    this.state.chunkDurationMs = opts.chunkDurationMs;
    this.state.recordingSource = opts.recordingSource;
    this.state.isRecording = true;
    this.state.audioChunks = [];
    this.state.lastProcessedTime = Date.now();
    this.state.totalChunksProcessed = 0;
    this.state.chunkCounter = 0;

    // Generate unique recording ID
    this.currentRecordingId = `google_live_${Date.now()}`;

    try {
      console.log('🎤 Starting Google Live Transcript with file-based recording...');

      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      const result = await electronAPI.startSemiLiveRecording({
        chunkDurationMs: this.state.chunkDurationMs,
        source: this.state.recordingSource,
        filename: this.currentRecordingId
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to start recording');
      }

      console.log('✅ Google Live Transcript started with file-based approach');

    } catch (error) {
      this.state.isRecording = false;
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  stopRecording(): void {
    if (!this.state.isRecording) return;

    console.log('🛑 Stopping Google Live Transcript...');

    this.state.isRecording = false;

    // Stop the Electron recording
    if (window.electronAPI) {
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      if (electronAPI.stopSemiLiveRecording) {
        electronAPI.stopSemiLiveRecording().catch(error => {
          console.warn('Error stopping recording:', error);
        });
      }
    }

    // Reset state
    this.state.audioChunks = [];
    this.currentOptions = null;
    this.currentRecordingId = null;

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
      recordingSource: this.state.recordingSource
    };
  }
}

// Export singleton
export const googleLiveTranscript = new GoogleLiveTranscriptService();
export default googleLiveTranscript; 