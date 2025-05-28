// Load environment variables from .env files
require('dotenv').config({ path: require('path').join(__dirname, '../../..', '.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../..', '.env.local') });

const { ipcMain, app } = require('electron');
const recorder = require('node-record-lpcm16');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

class SemiLiveSpeechHandler {
  constructor() {
    this.recordingProcess = null;
    this.isRecording = false;
    this.audioChunks = [];
    this.chunkInterval = null;
    this.apiKey = null;
    this.setupIpcHandlers();
  }

  setupIpcHandlers() {
    // Start semi-live speech recognition
    ipcMain.handle('semi-live-speech:start', async (event, options) => {
      try {
        return await this.startRecording(event, options);
      } catch (error) {
        console.error('Error starting semi-live speech:', error);
        return { success: false, error: error.message };
      }
    });

    // Stop semi-live speech recognition
    ipcMain.handle('semi-live-speech:stop', async (event) => {
      try {
        return await this.stopRecording();
      } catch (error) {
        console.error('Error stopping semi-live speech:', error);
        return { success: false, error: error.message };
      }
    });
  }

  async startRecording(event, options = {}) {
    if (this.isRecording) {
      return { success: false, error: 'Recording is already active' };
    }

    try {
      // Get API key
      this.apiKey = process.env.GOOGLE_SPEECH_API_KEY;
      if (!this.apiKey) {
        throw new Error('No Google Cloud Speech API key found. Please set GOOGLE_SPEECH_API_KEY environment variable.');
      }

      // Check system recording capabilities
      const systemCheck = await this.checkSystemRecordingCapabilities();
      if (!systemCheck.success) {
        throw new Error(systemCheck.error);
      }

      const {
        sampleRateHertz = 16000,
        languageCode = 'en-US',
        enableAutomaticPunctuation = true,
        chunkDurationMs = 3000, // Send chunks every 3 seconds
        model = 'command_and_search',
        useEnhanced = true,
        profanityFilter = false
      } = options;

      this.config = {
        encoding: 'LINEAR16',
        sampleRateHertz: sampleRateHertz,
        languageCode: languageCode,
        enableAutomaticPunctuation: enableAutomaticPunctuation,
        model: model,
        useEnhanced: useEnhanced,
        profanityFilter: profanityFilter,
        audioChannelCount: 1
      };

      // Start recording with fallback options
      const recordingOptions = {
        sampleRateHertz: sampleRateHertz,
        threshold: 0,
        silence: '0.5',
        verbose: false,
        recordProgram: 'rec', // Use SoX for better compatibility
      };

      // Try to start recording with error handling
      try {
        this.recordingProcess = recorder
          .record(recordingOptions)
          .stream()
          .on('error', (error) => {
            const errorMessage = error?.message || error?.toString() || 'Unknown recording error';
            console.error('Recording error:', errorMessage);
            
            // Try fallback recording method
            this.tryFallbackRecording(event, sampleRateHertz);
          })
          .on('data', (chunk) => {
            this.audioChunks.push(chunk);
          });

        // Test if the recording stream is working
        setTimeout(() => {
          if (this.recordingProcess && !this.recordingProcess.readable) {
            console.warn('Recording stream not readable, trying fallback...');
            this.tryFallbackRecording(event, sampleRateHertz);
          }
        }, 1000);

      } catch (recordingError) {
        console.error('Failed to start recording:', recordingError);
        this.tryFallbackRecording(event, sampleRateHertz);
      }

      // Set up interval to process chunks
      this.chunkInterval = setInterval(() => {
        this.processAudioChunk(event);
      }, chunkDurationMs);

      this.isRecording = true;
      console.log('🔊 Semi-live speech recognition started');
      
      return { success: true };
    } catch (error) {
      console.error('Failed to start semi-live speech:', error);
      this.cleanup();
      return { success: false, error: error.message };
    }
  }

  async checkSystemRecordingCapabilities() {
    const execAsync = promisify(exec);

    try {
      // Check if we're on macOS and have the necessary permissions
      if (process.platform === 'darwin') {
        console.log('🔍 Checking macOS microphone permissions...');
        // Note: This is a basic check. Full permission checking would require native code.
      }

      // Check if SoX (rec command) is available
      try {
        await execAsync('which rec');
        console.log('✅ SoX (rec) is available');
        return { success: true };
      } catch (error) {
        console.log('⚠️ SoX (rec) not found, checking alternatives...');
      }

      // Check if sox command is available
      try {
        await execAsync('which sox');
        console.log('✅ SoX (sox) is available');
        return { success: true };
      } catch (error) {
        console.log('⚠️ SoX (sox) not found, checking alternatives...');
      }

      // Check if ffmpeg is available
      try {
        await execAsync('which ffmpeg');
        console.log('✅ ffmpeg is available');
        return { success: true };
      } catch (error) {
        console.log('⚠️ ffmpeg not found, checking alternatives...');
      }

      // Check if arecord is available (Linux)
      if (process.platform === 'linux') {
        try {
          await execAsync('which arecord');
          console.log('✅ arecord is available');
          return { success: true };
        } catch (error) {
          console.log('⚠️ arecord not found');
        }
      }

      // If no recording programs found
      return {
        success: false,
        error: 'No audio recording software found. Please install SoX (recommended) or ffmpeg:\n' +
               '• macOS: brew install sox\n' +
               '• Ubuntu/Debian: sudo apt-get install sox\n' +
               '• Or install ffmpeg: https://ffmpeg.org/download.html'
      };

    } catch (error) {
      return {
        success: false,
        error: `System check failed: ${error.message}`
      };
    }
  }

  tryFallbackRecording(event, sampleRateHertz) {
    console.log('🔄 Trying fallback recording methods...');
    
    // List of fallback recording programs to try
    const fallbackPrograms = ['sox', 'arecord', 'ffmpeg'];
    
    for (const program of fallbackPrograms) {
      try {
        console.log(`🔄 Trying recording with ${program}...`);
        
        const fallbackOptions = {
          sampleRateHertz: sampleRateHertz,
          threshold: 0,
          silence: '0.5',
          verbose: false,
          recordProgram: program,
        };

        this.recordingProcess = recorder
          .record(fallbackOptions)
          .stream()
          .on('error', (error) => {
            const errorMessage = error?.message || error?.toString() || 'Unknown recording error';
            console.error(`Recording error with ${program}:`, errorMessage);
            
            // If this was the last fallback, send error to renderer
            if (program === fallbackPrograms[fallbackPrograms.length - 1]) {
              event.sender.send('semi-live-speech:error', `Recording failed: ${errorMessage}. Please ensure you have audio recording permissions and SoX/ffmpeg installed.`);
              this.cleanup();
            }
          })
          .on('data', (chunk) => {
            this.audioChunks.push(chunk);
          });

        // If we get here without error, the fallback worked
        console.log(`✅ Successfully started recording with ${program}`);
        return;
        
      } catch (error) {
        console.error(`Failed to start recording with ${program}:`, error);
        continue;
      }
    }
    
    // If all fallbacks failed
    console.error('❌ All recording methods failed');
    event.sender.send('semi-live-speech:error', 'Recording failed: Unable to start audio recording. Please ensure you have audio recording permissions and audio recording software (SoX, ffmpeg, or arecord) installed.');
    this.cleanup();
  }

  async processAudioChunk(event) {
    if (this.audioChunks.length === 0) {
      return;
    }

    try {
      // Combine all chunks into a single buffer
      const audioBuffer = Buffer.concat(this.audioChunks);
      this.audioChunks = []; // Clear chunks for next interval

      // Skip if buffer is too small
      if (audioBuffer.length < 1000) {
        return;
      }

      // Convert to base64
      const audioBase64 = audioBuffer.toString('base64');

      // Prepare request data
      const requestData = {
        config: this.config,
        audio: {
          content: audioBase64
        }
      };

      // Send to Google Cloud Speech API
      const result = await this.callSpeechAPI(requestData);
      
      if (result && result.results && result.results.length > 0) {
        const transcript = result.results[0].alternatives[0].transcript;
        const confidence = result.results[0].alternatives[0].confidence;

        if (transcript && transcript.trim()) {
          // Send result to renderer
          event.sender.send('semi-live-speech:result', {
            transcript: transcript.trim(),
            isFinal: true, // All results are final in this approach
            confidence: confidence,
            speakerId: null
          });

          console.log(`🎯 CHUNK RESULT: ${transcript}`);
        }
      }
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      // Don't stop recording for individual chunk errors
    }
  }

  async callSpeechAPI(requestData) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(requestData);
      
      const options = {
        hostname: 'speech.googleapis.com',
        port: 443,
        path: `/v1/speech:recognize?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const result = JSON.parse(data);
              resolve(result);
            } else {
              console.error('API Error:', res.statusCode, data);
              reject(new Error(`API Error: ${res.statusCode} - ${data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  async stopRecording() {
    try {
      this.cleanup();
      console.log('🛑 Semi-live speech recognition stopped');
      return { success: true };
    } catch (error) {
      console.error('Failed to stop semi-live speech:', error);
      return { success: false, error: error.message };
    }
  }

  cleanup() {
    this.isRecording = false;

    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }

    if (this.recordingProcess) {
      try {
        this.recordingProcess.destroy();
      } catch (error) {
        console.error('Error destroying recording process:', error);
      }
      this.recordingProcess = null;
    }

    this.audioChunks = [];
  }

  // Cleanup when the app is closing
  destroy() {
    this.cleanup();
  }
}

// Export singleton instance
const semiLiveSpeechHandler = new SemiLiveSpeechHandler();

// Cleanup on app quit
app.on('before-quit', () => {
  semiLiveSpeechHandler.destroy();
});

module.exports = semiLiveSpeechHandler; 