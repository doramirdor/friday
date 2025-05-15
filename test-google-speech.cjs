const fs = require('fs');
const path = require('path');

// Import the Google Speech API handler from main.js
const { app } = require('electron');
const speech = require('@google-cloud/speech');

// Create a simplified version of the handler from main.js
async function handleGoogleSpeechAPI(audioBuffer, options = {}) {
  console.log('🔄 Testing Google Speech API with audio buffer', {
    audioBufferLength: audioBuffer?.length || audioBuffer?.byteLength || 'undefined',
    options: JSON.stringify(options)
  });
  
  try {
    // Configure speech options
    const sampleRateHertz = options.sampleRateHertz || 16000;
    const languageCode = options.languageCode || 'en-US';
    const encoding = options.encoding || 'LINEAR16';
    const audioChannelCount = options.audioChannelCount || 1;
    
    console.log('🔧 Speech configuration', {
      sampleRateHertz,
      languageCode,
      encoding,
      audioChannelCount
    });
    
    // Check for API key in environment variable
    const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
    
    let client;
    
    // If using API key
    if (apiKey) {
      client = new speech.SpeechClient({
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
      console.log('🔑 Using API key authentication for Google Speech');
    } else {
      // Check for environment variables
      const googleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      if (googleCredentials) {
        console.log(`🔑 Using credentials from environment: ${googleCredentials}`);
        client = new speech.SpeechClient();
      } else {
        console.error('❌ No valid Google Speech authentication method found.');
        console.error('Please set GOOGLE_SPEECH_API_KEY or GOOGLE_APPLICATION_CREDENTIALS environment variables.');
        return "Error: No valid Google Speech authentication method found.";
      }
    }
    
    const config = {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      audioChannelCount: audioChannelCount,
      enableAutomaticPunctuation: true,
      model: options.model || 'command_and_search',
      useEnhanced: true
    };
    
    // Convert audio buffer to base64
    const audioContent = Buffer.from(audioBuffer).toString('base64');
    
    const audio = {
      content: audioContent,
    };
    
    const request = {
      config: config,
      audio: audio,
    };
    
    console.log('🚀 Sending audio to Google Speech API with encoding:', encoding);
    const [response] = await client.recognize(request);
    
    if (!response || !response.results || response.results.length === 0) {
      console.log('⚠️ No transcription results returned');
      return 'No speech detected';
    }
    
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
      
    console.log('🎯 Transcription received:', transcription);
    return transcription;
  } catch (error) {
    console.error('❌ Error with speech recognition:', error);
    return `Error: ${error.message || 'Unknown error'}`;
  }
}

async function testSpeechRecognition(filePath) {
  console.log(`🧪 Testing speech recognition with file: ${filePath}`);
  
  try {
    // Read the file
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`✅ Successfully read audio file: ${filePath}, size: ${audioBuffer.length} bytes`);
    
    // Determine encoding based on file extension
    const fileExt = path.extname(filePath).toLowerCase();
    let encoding = 'LINEAR16'; // Default for WAV
    
    if (fileExt === '.mp3') {
      encoding = 'MP3';
      console.log('🎵 Detected MP3 format, using MP3 encoding');
    } else if (fileExt === '.ogg') {
      encoding = 'OGG_OPUS';
      console.log('🎵 Detected OGG format, using OGG_OPUS encoding');
    } else if (fileExt === '.wav') {
      encoding = 'LINEAR16';
      console.log('🎵 Detected WAV format, using LINEAR16 encoding');
    } else {
      console.log(`⚠️ Unknown file extension: ${fileExt}, defaulting to LINEAR16 encoding`);
    }
    
    // Call the handler with appropriate options
    const result = await handleGoogleSpeechAPI(audioBuffer, {
      encoding,
      sampleRateHertz: 16000,
      languageCode: 'en-US'
    });
    
    console.log('📝 Transcription result:', result);
    return { success: !result.startsWith('Error:'), transcription: result };
  } catch (error) {
    console.error('❌ Error testing speech with file:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

async function main() {
  try {
    // Check for required environment variables
    if (!process.env.GOOGLE_SPEECH_API_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error('❌ Missing Google Speech API credentials!');
      console.error('Please set either:');
      console.error('  - GOOGLE_SPEECH_API_KEY environment variable');
      console.error('  - GOOGLE_APPLICATION_CREDENTIALS environment variable');
      process.exit(1);
    }
    
    // Test WAV file
    console.log('\n🔈 TESTING WAV FILE 🔈');
    const wavResult = await testSpeechRecognition(path.join(__dirname, 'test-audio', 'test-speech.wav'));
    console.log('WAV RESULT:', wavResult);
    
    // Test MP3 file
    console.log('\n🔈 TESTING MP3 FILE 🔈');
    const mp3Result = await testSpeechRecognition(path.join(__dirname, 'test-audio', 'test-speech.mp3'));
    console.log('MP3 RESULT:', mp3Result);
  } catch (error) {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  }
}

main(); 