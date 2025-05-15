const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Get API key from environment variable
const API_KEY = process.env.GOOGLE_SPEECH_API_KEY;

if (!API_KEY) {
  console.error('❌ GOOGLE_SPEECH_API_KEY environment variable is not set');
  console.error('Usage: GOOGLE_SPEECH_API_KEY=your-api-key node test-api-key-speech.js');
  process.exit(1);
}

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
      console.log('🎵 Using MP3 encoding');
    } else if (fileExt === '.ogg') {
      encoding = 'OGG_OPUS';
      console.log('🎵 Using OGG_OPUS encoding');
    } else if (fileExt === '.wav') {
      encoding = 'LINEAR16';
      console.log('🎵 Using LINEAR16 encoding');
    } else {
      console.log(`⚠️ Unknown file extension: ${fileExt}, defaulting to LINEAR16 encoding`);
    }
    
    // Convert audio to base64
    const base64Audio = audioBuffer.toString('base64');
    
    console.log('🚀 Sending request to Google Speech API with API key');
    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${API_KEY}`,
      {
        config: {
          encoding: encoding,
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'default'
        },
        audio: {
          content: base64Audio
        }
      }
    );
    
    if (!response.data.results || response.data.results.length === 0) {
      console.log('⚠️ No transcription results returned');
      return { transcription: 'No speech detected' };
    }
    
    const transcription = response.data.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
      
    console.log('🎯 Transcription received:');
    console.log(transcription);
    return { transcription };
    
  } catch (error) {
    console.error('❌ Error with speech recognition:');
    if (error.response && error.response.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    return { error: error.message || 'Unknown error' };
  }
}

async function main() {
  // Test WAV file
  console.log('\n🔈 TESTING WAV FILE 🔈');
  await testSpeechRecognition(path.join(__dirname, 'test-audio', 'test-speech.wav'));
  
  // Test MP3 file
  console.log('\n🔈 TESTING MP3 FILE 🔈');
  await testSpeechRecognition(path.join(__dirname, 'test-audio', 'test-speech.mp3'));
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 