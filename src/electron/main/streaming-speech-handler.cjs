const { ipcMain, app } = require('electron');
const recorder = require('node-record-lpcm16');
const { SpeechClient } = require('@google-cloud/speech');
const path = require('path');
const fs = require('fs');

class StreamingSpeechHandler {
  constructor() {
    this.client = null;
    this.recognizeStream = null;
    this.recordingProcess = null;
    this.isStreaming = false;
    this.setupIpcHandlers();
  }

  setupIpcHandlers() {
    // Start streaming speech recognition
    ipcMain.handle('streaming-speech:start', async (event, options) => {
      try {
        return await this.startStreaming(event, options);
      } catch (error) {
        console.error('Error starting streaming speech:', error);
        return { success: false, error: error.message };
      }
    });

    // Stop streaming speech recognition
    ipcMain.handle('streaming-speech:stop', async (event) => {
      try {
        return await this.stopStreaming();
      } catch (error) {
        console.error('Error stopping streaming speech:', error);
        return { success: false, error: error.message };
      }
    });
  }

  async startStreaming(event, options = {}) {
    if (this.isStreaming) {
      return { success: false, error: 'Streaming is already active' };
    }

    try {
      // Initialize Google Speech client
      await this.initializeSpeechClient();

      const {
        sampleRateHertz = 16000,
        languageCode = 'en-US',
        enableAutomaticPunctuation = true,
        enableWordTimeOffsets = true,
        model = 'command_and_search',
        useEnhanced = true,
        profanityFilter = false,
        enableSpeakerDiarization = false,
        diarizationSpeakerCount = 2
      } = options;

      // Configure the streaming request
      const request = {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: sampleRateHertz,
          languageCode: languageCode,
          enableAutomaticPunctuation: enableAutomaticPunctuation,
          enableWordTimeOffsets: enableWordTimeOffsets,
          model: model,
          useEnhanced: useEnhanced,
          profanityFilter: profanityFilter,
          audioChannelCount: 1,
          ...(enableSpeakerDiarization && {
            diarizationConfig: {
              enableSpeakerDiarization: true,
              minSpeakerCount: 1,
              maxSpeakerCount: diarizationSpeakerCount
            }
          })
        },
        interimResults: true // Get words as they're spoken
      };

      // Create the streaming RPC
      this.recognizeStream = this.client
        .streamingRecognize(request)
        .on('error', (error) => {
          console.error('Streaming recognition error:', error);
          event.sender.send('streaming-speech:error', error.message);
          this.cleanup();
        })
        .on('data', (data) => {
          const result = data.results[0];
          if (!result) return;

          const { transcript } = result.alternatives[0];
          const confidence = result.alternatives[0].confidence;
          
          // Extract speaker information if available
          let speakerId = undefined;
          if (result.alternatives[0].words && result.alternatives[0].words.length > 0) {
            const firstWord = result.alternatives[0].words[0];
            if (firstWord.speakerTag !== undefined) {
              speakerId = `speaker_${firstWord.speakerTag}`;
            }
          }

          // Send result to renderer
          event.sender.send('streaming-speech:result', {
            transcript: transcript,
            isFinal: result.isFinal,
            confidence: confidence,
            speakerId: speakerId
          });

          // Log the result
          if (result.isFinal) {
            console.log(`🎯 FINAL: ${transcript}`);
          } else {
            console.log(`🔄 INTERIM: ${transcript}`);
          }
        });

      // Start recording and pipe to Google
      this.recordingProcess = recorder
        .record({
          sampleRateHertz: sampleRateHertz,
          threshold: 0,
          silence: '0.5',
          verbose: false,
          recordProgram: 'rec', // Use SoX for better compatibility
        })
        .stream()
        .on('error', (error) => {
          console.error('Recording error:', error);
          event.sender.send('streaming-speech:error', `Recording error: ${error.message}`);
          this.cleanup();
        })
        .pipe(this.recognizeStream);

      this.isStreaming = true;
      console.log('🔊 Streaming speech recognition started');
      
      return { success: true };
    } catch (error) {
      console.error('Failed to start streaming speech:', error);
      this.cleanup();
      return { success: false, error: error.message };
    }
  }

  async stopStreaming() {
    try {
      this.cleanup();
      console.log('🛑 Streaming speech recognition stopped');
      return { success: true };
    } catch (error) {
      console.error('Failed to stop streaming speech:', error);
      return { success: false, error: error.message };
    }
  }

  async initializeSpeechClient() {
    if (this.client) {
      return; // Already initialized
    }

    try {
      // Try to get API key from environment or settings
      const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
      
      if (apiKey) {
        console.log('🔑 Using API key authentication for streaming speech');
        this.client = new SpeechClient({
          credentials: {
            client_email: undefined,
            private_key: undefined
          },
          projectId: process.env.GOOGLE_PROJECT_ID || '',
          apiEndpoint: 'speech.googleapis.com',
          auth: {
            apiKey: apiKey
          }
        });
      } else {
        // Use credentials file
        const credentialsPath = path.join(__dirname, '..', 'google-credentials.json');
        
        if (fs.existsSync(credentialsPath)) {
          console.log('📄 Using credentials file for streaming speech');
          this.client = new SpeechClient({
            keyFilename: credentialsPath,
          });
        } else {
          throw new Error('No Google Cloud Speech credentials found. Please set GOOGLE_SPEECH_API_KEY environment variable or add google-credentials.json file.');
        }
      }

      console.log('✅ Google Speech client initialized for streaming');
    } catch (error) {
      console.error('Failed to initialize Google Speech client:', error);
      throw error;
    }
  }

  cleanup() {
    this.isStreaming = false;

    if (this.recordingProcess) {
      try {
        this.recordingProcess.destroy();
      } catch (error) {
        console.error('Error destroying recording process:', error);
      }
      this.recordingProcess = null;
    }

    if (this.recognizeStream) {
      try {
        this.recognizeStream.destroy();
      } catch (error) {
        console.error('Error destroying recognition stream:', error);
      }
      this.recognizeStream = null;
    }
  }

  // Cleanup when the app is closing
  destroy() {
    this.cleanup();
    this.client = null;
  }
}

// Export singleton instance
const streamingSpeechHandler = new StreamingSpeechHandler();

// Cleanup on app quit
app.on('before-quit', () => {
  streamingSpeechHandler.destroy();
});

module.exports = streamingSpeechHandler; 