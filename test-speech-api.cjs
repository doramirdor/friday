const fs = require('fs');
const path = require('path');
const { SpeechClient } = require('@google-cloud/speech');

// Function to test speech recognition with file
async function testSpeechRecognition(filePath) {
  try {
    console.log(`🧪 Testing speech recognition with: ${filePath}`);
    
    // Read the file
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`✅ Read audio file: ${filePath}, size: ${audioBuffer.length} bytes`);
    
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
    
    // Initialize a client using environment variables or credentials file
    let client;
    const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
    
    if (apiKey) {
      console.log('🔑 Using API key authentication for Google Speech');
      client = new SpeechClient({
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
      const credentialsPath = path.join(__dirname, 'electron', 'google-credentials.json');
      if (!fs.existsSync(credentialsPath)) {
        console.error('❌ Google credentials file not found at:', credentialsPath);
        return { error: 'Credentials file not found' };
      }
      
      console.log('📄 Using credentials file at:', credentialsPath);
      client = new SpeechClient({
        keyFilename: credentialsPath,
      });
    }
    
    // Configure request
    const config = {
      encoding: encoding,
      sampleRateHertz: 16000,
      languageCode: 'en-US',
      audioChannelCount: 1,
      enableAutomaticPunctuation: true,
      model: 'command_and_search',
      useEnhanced: true
    };
    
    // Convert audio to base64
    const audioContent = audioBuffer.toString('base64');
    
    const audio = {
      content: audioContent,
    };
    
    const request = {
      config,
      audio,
    };
    
    console.log('🚀 Sending to Google Speech API...');
    const [response] = await client.recognize(request);
    
    if (!response || !response.results || response.results.length === 0) {
      console.log('⚠️ No transcription results returned');
      return { transcription: 'No speech detected' };
    }
    
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
      
    console.log('🎯 Transcription received:', transcription);
    return { transcription };
    
  } catch (error) {
    console.error('❌ Error with speech recognition:', error);
    return { error: error.message || 'Unknown error' };
  }
}

async function main() {
  // Test WAV file
  console.log('\n🔈 TESTING WAV FILE 🔈');
  const wavResult = await testSpeechRecognition(path.join(__dirname, 'test-audio', 'test-speech.wav'));
  console.log('WAV RESULT:', wavResult);
  
  // Test MP3 file
  console.log('\n🔈 TESTING MP3 FILE 🔈');
  const mp3Result = await testSpeechRecognition(path.join(__dirname, 'test-audio', 'test-speech.mp3'));
  console.log('MP3 RESULT:', mp3Result);
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 