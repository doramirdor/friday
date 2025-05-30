// Google Live Transcript Service - Regular Recording with Auto-Save
// Uses regular recording infrastructure with 1-second auto-save intervals

export interface GoogleLiveTranscriptOptions {
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakers?: number;
  encoding?: 'LINEAR16' | 'WEBM_OPUS';
  sampleRateHertz?: number;
  autoSaveIntervalMs?: number;
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

// Extended ElectronAPI interface for regular recording
interface ExtendedElectronAPI {
  // Regular recording methods
  systemAudioRecording: {
    startRecording: (options: { filename: string; format: string }) => Promise<{ success: boolean; error?: string }>;
    stopRecording: () => Promise<{ success: boolean; error?: string }>;
  };
  micRecording: {
    startRecording: (options: { filename: string; format: string }) => Promise<{ success: boolean; error?: string }>;
    stopRecording: () => Promise<{ success: boolean; error?: string }>;
  };
  combinedRecording: {
    startRecording: (options: { filename: string; format: string }) => Promise<{ success: boolean; error?: string }>;
    stopRecording: () => Promise<{ success: boolean; error?: string }>;
  };
  // File operations
  readAudioFile: (path: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  checkFileExists: (path: string) => Promise<boolean>;
  saveAudioFile: (buffer: ArrayBuffer, filename: string, formats: string[]) => Promise<{ success: boolean; filePath?: string; error?: string }>;
}

// Processing state for regular recording with auto-save
interface ProcessingState {
  isRecording: boolean;
  autoSaveIntervalMs: number;
  recordingSource: string;
  recordingStartTime: number;
  lastProcessedTime: number;
  totalChunksProcessed: number;
  processedFiles: Set<string>;
}

class GoogleLiveTranscriptService {
  private state: ProcessingState = {
    isRecording: false,
    autoSaveIntervalMs: 1000, // 1 second auto-save
    recordingSource: 'mic',
    recordingStartTime: 0,
    lastProcessedTime: 0,
    totalChunksProcessed: 0,
    processedFiles: new Set()
  };
  
  private currentOptions: GoogleLiveTranscriptOptions | null = null;
  private currentRecordingId: string | null = null;
  private apiKey: string | null = null;
  private autoSaveInterval: number | null = null;
  private recordingAPI: { startRecording: (options: { filename: string; format: string }) => Promise<{ success: boolean; error?: string }>; stopRecording: () => Promise<{ success: boolean; error?: string }> } | null = null;
  
  private resultCallback: ((result: GoogleLiveTranscriptResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  constructor() {
    console.log('🏗️ Google Live: Constructor called - initializing service...');
    this.checkApiKey();
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

  private setupAutoSaveInterval(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    console.log(`🔄 Google Live: Setting up ${this.state.autoSaveIntervalMs}ms auto-save interval`);

    this.autoSaveInterval = window.setInterval(async () => {
      if (!this.state.isRecording) {
        return;
      }

      await this.processCurrentRecording();
    }, this.state.autoSaveIntervalMs);
  }

  private async processCurrentRecording(): Promise<void> {
    try {
      const currentTime = Date.now();
      const recordingDuration = currentTime - this.state.recordingStartTime;
      
      console.log(`🎵 Google Live: Processing current recording (${recordingDuration}ms since start)`);

      // Create filename for the current chunk
      const chunkFilename = `${this.currentRecordingId}_live_${Math.floor(recordingDuration / 1000)}s`;
      const chunkPath = `~/Documents/Friday Recordings/live-chunks/${chunkFilename}`;

      console.log(`💾 Google Live: Saving current recording to: ${chunkPath}`);

      // Here we'll save the current recording buffer to the live-chunks folder
      // For now, let's check if a file exists and process it
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      
      // Check if there's a recording file to process
      // This is a simplified approach - in a real implementation, we'd get the current audio buffer
      const potentialFile = `~/Documents/Friday Recordings/${this.currentRecordingId}.mp3`;
      
      if (await electronAPI.checkFileExists(potentialFile)) {
        if (!this.state.processedFiles.has(potentialFile)) {
          console.log(`🎯 Google Live: Found new recording file to process: ${potentialFile}`);
          await this.processAudioFile(potentialFile);
          this.state.processedFiles.add(potentialFile);
        }
      }

      this.state.lastProcessedTime = currentTime;

    } catch (error) {
      console.error('❌ Google Live: Error processing current recording:', error);
      if (this.errorCallback) {
        this.errorCallback(error as Error);
      }
    }
  }

  private async processAudioFile(filePath: string): Promise<void> {
    console.log(`🔄 Google Live: processAudioFile called for: ${filePath}`);
    
    if (!this.currentOptions || !this.apiKey) {
      console.warn('⚠️ Google Live: Missing options or API key, skipping file processing');
      return;
    }

    try {
      console.log(`🔄 Google Live: Processing audio file: ${filePath}`);

      // Read the audio file
      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      console.log(`📖 Google Live: Reading audio file: ${filePath}`);
      const audioResult = await electronAPI.readAudioFile(filePath);
      
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
      const transcriptionResult = await this.callGoogleSpeechAPI(audioData, this.currentOptions as Required<GoogleLiveTranscriptOptions>);
      
      if (transcriptionResult) {
        console.log(`🎯 Google Live: Received transcription result:`, transcriptionResult);
        if (this.resultCallback) {
          console.log(`📡 Google Live: Calling result callback...`);
          this.resultCallback(transcriptionResult);
        } else {
          console.warn(`⚠️ Google Live: No result callback registered`);
        }
      } else {
        console.log(`🤐 Google Live: No transcription result from API call`);
      }

      this.state.totalChunksProcessed++;
      console.log(`📊 Google Live: File processing complete. Total processed: ${this.state.totalChunksProcessed}`);

    } catch (error) {
      console.error(`❌ Error processing audio file ${filePath}:`, error);
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

      console.log(`🔍 Google Live: Calling Speech API for transcription with config:`, {
        encoding: options.encoding,
        sampleRateHertz: options.sampleRateHertz,
        languageCode: options.languageCode,
        enableSpeakerDiarization: options.enableSpeakerDiarization,
        diarizationSpeakerCount: options.maxSpeakers,
        audioDataLength: audioData.length
      });

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
    const hasElectronAPI = !!(window as unknown as { electronAPI?: ExtendedElectronAPI })?.electronAPI;
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

    const opts = {
      languageCode: 'en-US',
      enableSpeakerDiarization: true,
      maxSpeakers: 4,
      encoding: 'LINEAR16' as const,
      sampleRateHertz: 16000,
      autoSaveIntervalMs: 1000, // 1 second auto-save
      recordingSource: 'mic' as const,
      ...options
    };

    console.log('🎤 Google Live: Final options:', opts);

    this.currentOptions = opts;
    this.state.autoSaveIntervalMs = opts.autoSaveIntervalMs;
    this.state.recordingSource = opts.recordingSource;
    this.state.isRecording = true;
    this.state.recordingStartTime = Date.now();
    this.state.lastProcessedTime = Date.now();
    this.state.totalChunksProcessed = 0;
    this.state.processedFiles.clear();

    // Generate unique recording ID
    this.currentRecordingId = `google_live_${Date.now()}`;
    console.log('🎤 Google Live: Generated recording ID:', this.currentRecordingId);

    try {
      console.log('🎤 Starting Google Live Transcript with regular recording + auto-save...');

      const electronAPI = window.electronAPI as ExtendedElectronAPI;
      
      // Select the appropriate recording API based on source
      if (opts.recordingSource === 'system') {
        this.recordingAPI = electronAPI.systemAudioRecording;
      } else if (opts.recordingSource === 'both') {
        this.recordingAPI = electronAPI.combinedRecording;
      } else {
        this.recordingAPI = electronAPI.micRecording;
      }

      console.log(`🎤 Google Live: Starting ${opts.recordingSource} recording...`);
      
      const result = await this.recordingAPI.startRecording({
        filename: this.currentRecordingId,
        format: 'mp3'
      });

      console.log('🎤 Google Live: Recording start result:', result);

      if (!result.success) {
        console.error('❌ Google Live: Recording failed to start:', result.error);
        throw new Error(result.error || 'Failed to start recording');
      }

      console.log('✅ Google Live Transcript started with regular recording');
      console.log('📊 Google Live: Final state after start:', {
        isRecording: this.state.isRecording,
        autoSaveIntervalMs: this.state.autoSaveIntervalMs,
        recordingSource: this.state.recordingSource,
        recordingId: this.currentRecordingId
      });

      // Start auto-save interval to process recording periodically
      this.setupAutoSaveInterval();

    } catch (error) {
      console.error('❌ Google Live: Error during recording start:', error);
      this.state.isRecording = false;
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  stopRecording(): void {
    if (!this.state.isRecording) return;

    console.log('🛑 Stopping Google Live Transcript...');

    this.state.isRecording = false;

    // Clear auto-save interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
      console.log('🔄 Google Live: Auto-save interval cleared');
    }

    // Stop the recording
    if (this.recordingAPI) {
      this.recordingAPI.stopRecording().catch((error: Error) => {
        console.warn('Error stopping recording:', error);
      });
    }

    // Reset state
    this.state.processedFiles.clear();
    this.currentOptions = null;
    this.currentRecordingId = null;
    this.recordingAPI = null;

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
      autoSaveIntervalMs: this.state.autoSaveIntervalMs,
      recordingSource: this.state.recordingSource,
      processedFilesCount: this.state.processedFiles.size
    };
  }

  // Debug method to check status
  debugStatus() {
    console.log('🔍 Google Live: Debug status...');
    const electronAPI = window.electronAPI as ExtendedElectronAPI;
    console.log('🔍 electronAPI available:', !!electronAPI);
    console.log('🔍 API key available:', !!this.apiKey);
    console.log('🔍 Current state:', this.state);
    console.log('🔍 Current options:', this.currentOptions);
    console.log('🔍 Recording API:', !!this.recordingAPI);
  }
}

// Export singleton
export const googleLiveTranscript = new GoogleLiveTranscriptService();

// Add debug access to the singleton
(window as unknown as { __debugGoogleLive?: () => void }).__debugGoogleLive = googleLiveTranscript.debugStatus.bind(googleLiveTranscript);

export default googleLiveTranscript; 