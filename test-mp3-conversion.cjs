const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

/**
 * Convert WAV file to MP3 format for better compatibility
 * @param {string} wavFilePath - Path to WAV file
 * @returns {Promise<string>} Path to converted MP3 file
 */
async function convertWavToMp3(wavFilePath) {
  const mp3FilePath = wavFilePath.replace('.wav', '.mp3');
  
  try {
    console.log(`🔄 Converting ${wavFilePath} to ${mp3FilePath}`);
    
    // First check if ffmpeg is installed
    try {
      await execPromise('ffmpeg -version');
      console.log('✅ ffmpeg is installed and available');
    } catch (ffmpegError) {
      console.error('❌ ffmpeg is not installed or not in PATH:', ffmpegError);
      throw new Error('ffmpeg is required for audio conversion but was not found');
    }
    
    // Try the conversion with detailed logging
    try {
      const { stdout, stderr } = await execPromise(`ffmpeg -i "${wavFilePath}" -vn -ar 44100 -ac 2 -b:a 192k "${mp3FilePath}" -y`);
      if (stdout) console.log('📤 ffmpeg stdout:', stdout);
      if (stderr) {
        console.log('⚠️ ffmpeg stderr (not necessarily an error):', stderr);
      }
    } catch (conversionError) {
      console.error('❌ Error during ffmpeg conversion:', conversionError);
      throw conversionError;
    }
    
    // Check if the output file was created
    if (!fs.existsSync(mp3FilePath)) {
      throw new Error(`MP3 file was not created at ${mp3FilePath}`);
    }
    
    console.log('✅ Conversion complete, MP3 file created at:', mp3FilePath);
    return mp3FilePath;
  } catch (error) {
    console.error('❌ Error converting audio:', error);
    // If conversion fails, just return the WAV file
    console.log('⚠️ Returning original WAV file due to conversion error');
    return wavFilePath;
  }
}

// Get API key from environment variable
const API_KEY = process.env.GOOGLE_SPEECH_API_KEY;

if (!API_KEY) {
  console.error('❌ GOOGLE_SPEECH_API_KEY environment variable is not set');
  console.error('Usage: GOOGLE_SPEECH_API_KEY=your-api-key node test-mp3-conversion.js');
  process.exit(1);
}

/**
 * Test the speech recognition using the specified file
 */
async function testSpeechRecognition(filePath) {
  try {
    const axios = require('axios');
    console.log(`\n🧪 Testing speech recognition with: ${filePath}`);
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return { error: 'File not found' };
    }
    
    // Read the file
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`✅ Read audio file: ${filePath}, size: ${audioBuffer.length} bytes`);
    
    // Get file information
    const stats = fs.statSync(filePath);
    console.log(`ℹ️ File size: ${stats.size} bytes`);
    console.log(`ℹ️ Last modified: ${stats.mtime}`);
    
    // Check file content/header to verify it's a valid audio file
    const fileHeader = audioBuffer.slice(0, 16);
    console.log(`🔍 File header (hex): ${fileHeader.toString('hex')}`);
    
    // Determine encoding based on file extension and content
    const fileExt = path.extname(filePath).toLowerCase();
    let encoding = 'LINEAR16'; // Default
    
    if (fileExt === '.mp3') {
      encoding = 'MP3';
      console.log('🎵 Using MP3 encoding');
    } else if (fileExt === '.wav') {
      encoding = 'LINEAR16';
      console.log('🎵 Using LINEAR16 encoding');
    }
    
    // Convert audio to base64
    const base64Audio = audioBuffer.toString('base64');
    
    console.log('🚀 Sending request to Google Speech API with API key...');
    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${API_KEY}`,
      {
        config: {
          encoding: encoding,
          sampleRateHertz: encoding === 'MP3' ? 44100 : 16000,
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
  try {
    // Test with WAV file
    const wavFile = path.join(__dirname, 'test-audio', 'test-speech.wav');
    console.log(`\n🔈 TESTING ORIGINAL WAV FILE: ${wavFile} 🔈`);
    await testSpeechRecognition(wavFile);
    
    // Convert WAV to MP3
    console.log('\n🔄 TESTING WAV TO MP3 CONVERSION 🔄');
    const mp3FilePath = await convertWavToMp3(wavFile);
    
    // Verify the MP3 file was created with the correct extension
    if (mp3FilePath === wavFile) {
      console.error('❌ Conversion failed, returned the original WAV file');
    } else if (!mp3FilePath.toLowerCase().endsWith('.mp3')) {
      console.error('❌ Converted file does not have .mp3 extension:', mp3FilePath);
    } else {
      console.log('✅ MP3 file created successfully with correct extension');
    }
    
    // Test with the converted MP3 file
    if (fs.existsSync(mp3FilePath) && mp3FilePath !== wavFile) {
      console.log(`\n🔈 TESTING CONVERTED MP3 FILE: ${mp3FilePath} 🔈`);
      await testSpeechRecognition(mp3FilePath);
    }
    
    // Also test with the existing MP3 test file for comparison
    const existingMp3File = path.join(__dirname, 'test-audio', 'test-speech.mp3');
    if (fs.existsSync(existingMp3File)) {
      console.log(`\n🔈 TESTING EXISTING MP3 FILE: ${existingMp3File} 🔈`);
      await testSpeechRecognition(existingMp3File);
    }
    
    console.log('\n✅ Test completed');
  } catch (error) {
    console.error('❌ Unhandled error:', error);
  }
}

main(); 