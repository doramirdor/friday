/**
 * Google Live Stable Service
 * 
 * This service provides a stable implementation of Google Live Transcript functionality
 * using a file-based approach instead of dangerous real-time streaming that crashes the system.
 * 
 * It works by:
 * 1. Recording audio in 1-second chunks (like Gemini Semi-Live)
 * 2. Saving each chunk as a temporary file
 * 3. Sending the file to Google Cloud Speech-to-Text API
 * 4. Processing the results with speaker diarization
 * 5. Cleaning up temporary files
 * 
 * This approach is much more stable than ScriptProcessorNode and real-time streaming.
 */

interface ElectronAPI {
  env?: {
    GOOGLE_SPEECH_API_KEY?: string;
  };
}

interface GoogleSpeechWord {
  word: string;
  speakerTag?: number;
}

interface GoogleSpeechAlternative {
  transcript: string;
  confidence: number;
  words?: GoogleSpeechWord[];
}

interface GoogleSpeechResult {
  alternatives: GoogleSpeechAlternative[];
}

export interface GoogleLiveStableOptions {
  languageCode?: string;
  enableSpeakerDiarization?: boolean;
  maxSpeakers?: number;
  chunkDurationMs?: number;
}

export interface GoogleLiveStableResult {
  transcript: string;
  speakers?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  confidence?: number;
}

class GoogleLiveStableService {
  private isRecording = false;
  private isAvailable = false;
  private apiKey: string | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunkInterval: number | null = null;
  private onTranscriptCallback: ((result: GoogleLiveStableResult) => void) | null = null;
  
  constructor() {
    this.initializeService();
  }

  private async initializeService() {
    try {
      // Check for Google Speech API key
      const electronAPI = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
      const apiKey = electronAPI?.env?.GOOGLE_SPEECH_API_KEY;
      
      if (apiKey) {
        this.apiKey = apiKey;
        this.isAvailable = true;
        console.log('✅ Google Live Stable service initialized successfully');
      } else {
        console.warn('⚠️ Google Speech API key not found in environment');
        this.isAvailable = false;
      }
    } catch (error) {
      console.error('❌ Failed to initialize Google Live Stable service:', error);
      this.isAvailable = false;
    }
  }

  public getAvailability(): boolean {
    return this.isAvailable && !!this.apiKey;
  }

  public async startRecording(
    options: GoogleLiveStableOptions = {},
    onTranscript: (result: GoogleLiveStableResult) => void
  ): Promise<void> {
    if (!this.getAvailability()) {
      throw new Error('Google Live Stable service is not available. Please check your GOOGLE_SPEECH_API_KEY.');
    }

    if (this.isRecording) {
      console.warn('⚠️ Recording already in progress');
      return;
    }

    try {
      this.onTranscriptCallback = onTranscript;
      
      // Get microphone stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Set up MediaRecorder for file-based chunks
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });

      let audioChunks: Blob[] = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          await this.processAudioChunk(audioBlob, options);
          audioChunks = [];
        }
      };

      // Start recording
      this.mediaRecorder.start();
      this.isRecording = true;

      // Set up interval to create chunks (default 1 second)
      const chunkDuration = options.chunkDurationMs || 1000;
      this.chunkInterval = window.setInterval(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop();
          this.mediaRecorder.start();
        }
      }, chunkDuration);

      console.log('🎤 Google Live Stable recording started');
    } catch (error) {
      console.error('❌ Failed to start Google Live Stable recording:', error);
      await this.stopRecording();
      throw error;
    }
  }

  public async stopRecording(): Promise<void> {
    try {
      this.isRecording = false;

      if (this.chunkInterval) {
        clearInterval(this.chunkInterval);
        this.chunkInterval = null;
      }

      if (this.mediaRecorder) {
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop();
        }
        this.mediaRecorder = null;
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      this.onTranscriptCallback = null;
      console.log('🛑 Google Live Stable recording stopped');
    } catch (error) {
      console.error('❌ Error stopping Google Live Stable recording:', error);
    }
  }

  private async processAudioChunk(audioBlob: Blob, options: GoogleLiveStableOptions): Promise<void> {
    try {
      // Convert blob to base64 for Google Speech API
      const base64Audio = await this.blobToBase64(audioBlob);
      
      // Prepare request for Google Cloud Speech-to-Text
      const requestBody = {
        config: {
          encoding: this.getGoogleAudioEncoding(audioBlob.type),
          sampleRateHertz: 16000,
          languageCode: options.languageCode || 'en-US',
          enableSpeakerDiarization: options.enableSpeakerDiarization || true,
          diarizationSpeakerCount: options.maxSpeakers || 4,
          model: 'latest_long',
          useEnhanced: true
        },
        audio: {
          content: base64Audio.split(',')[1] // Remove data:audio/... prefix
        }
      };

      // Call Google Cloud Speech-to-Text API
      const response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        throw new Error(`Google Speech API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.results && result.results.length > 0) {
        await this.processGoogleSpeechResults(result.results);
      }
    } catch (error) {
      console.error('❌ Error processing audio chunk:', error);
    }
  }

  private async processGoogleSpeechResults(results: GoogleSpeechResult[]): Promise<void> {
    try {
      const processedSpeakers = new Map<number, { id: string; name: string; color: string }>();
      const colors = ['#28C76F', '#7367F0', '#FF9F43', '#EA5455', '#00CFE8', '#9F44D3'];
      
      let fullTranscript = '';
      let maxConfidence = 0;

      for (const result of results) {
        const alternative = result.alternatives[0];
        if (!alternative) continue;

        const transcript = alternative.transcript || '';
        const confidence = alternative.confidence || 0;
        
        maxConfidence = Math.max(maxConfidence, confidence);

        // Process speaker diarization if available
        if (alternative.words && alternative.words.length > 0) {
          let currentSpeaker = -1;
          let currentSpeakerText = '';

          for (const word of alternative.words) {
            const speakerTag = word.speakerTag || 1;

            if (speakerTag !== currentSpeaker) {
              // Add previous speaker's text if any
              if (currentSpeaker !== -1 && currentSpeakerText.trim()) {
                if (!processedSpeakers.has(currentSpeaker)) {
                  processedSpeakers.set(currentSpeaker, {
                    id: currentSpeaker.toString(),
                    name: `Speaker ${currentSpeaker}`,
                    color: colors[(currentSpeaker - 1) % colors.length]
                  });
                }
                fullTranscript += `Speaker ${currentSpeaker}: ${currentSpeakerText.trim()}\n`;
              }

              // Start new speaker
              currentSpeaker = speakerTag;
              currentSpeakerText = word.word + ' ';
            } else {
              currentSpeakerText += word.word + ' ';
            }
          }

          // Add final speaker's text
          if (currentSpeaker !== -1 && currentSpeakerText.trim()) {
            if (!processedSpeakers.has(currentSpeaker)) {
              processedSpeakers.set(currentSpeaker, {
                id: currentSpeaker.toString(),
                name: `Speaker ${currentSpeaker}`,
                color: colors[(currentSpeaker - 1) % colors.length]
              });
            }
            fullTranscript += `Speaker ${currentSpeaker}: ${currentSpeakerText.trim()}\n`;
          }
        } else {
          // No speaker diarization, just add the transcript
          fullTranscript += transcript;
        }
      }

      // Send results to callback if transcript is not empty
      if (fullTranscript.trim() && this.onTranscriptCallback) {
        const googleResult: GoogleLiveStableResult = {
          transcript: fullTranscript.trim(),
          speakers: Array.from(processedSpeakers.values()),
          confidence: maxConfidence
        };

        this.onTranscriptCallback(googleResult);
      }
    } catch (error) {
      console.error('❌ Error processing Google Speech results:', error);
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/wav'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // Fallback
  }

  private getGoogleAudioEncoding(mimeType: string): string {
    if (mimeType.includes('webm')) {
      return 'WEBM_OPUS';
    } else if (mimeType.includes('mp4')) {
      return 'MP4';
    } else if (mimeType.includes('wav')) {
      return 'LINEAR16';
    }
    return 'WEBM_OPUS'; // Default
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  public getCurrentState() {
    return {
      isRecording: this.isRecording,
      isAvailable: this.getAvailability()
    };
  }
}

// Export singleton instance
export const googleLiveStableService = new GoogleLiveStableService(); 