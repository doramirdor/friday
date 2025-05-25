#!/usr/bin/env node
/**
 * Test script to verify Google Speech API transcription functionality
 * This will use the same code path as the "Send to Transcript" button
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import os from 'os';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get API key from environment
const API_KEY = process.env.GOOGLE_SPEECH_API_KEY;
if (!API_KEY) {
  console.error('❌ Error: GOOGLE_SPEECH_API_KEY environment variable not set');
  console.error('   Please set it to your Google Speech API key');
  process.exit(1);
}

// Path to Friday Recordings directory
const RECORDINGS_DIR = path.join(os.homedir(), 'Documents', 'Friday Recordings');

async function getLatestRecording() {
  try {
    const files = fs.readdirSync(RECORDINGS_DIR);
    
    // Filter for audio files and sort by modification time (newest first)
    const audioFiles = files
      .filter(file => ['.mp3', '.wav', '.ogg'].includes(path.extname(file).toLowerCase()))
      .map(file => {
        const filePath = path.join(RECORDINGS_DIR, file);
        return {
          name: file,
          path: filePath,
          mtime: fs.statSync(filePath).mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
    
    if (audioFiles.length === 0) {
      console.error('❌ Error: No audio recordings found in', RECORDINGS_DIR);
      process.exit(1);
    }
    
    console.log('📊 Found', audioFiles.length, 'audio files');
    console.log('📂 Latest recording:', audioFiles[0].name);
    
    return audioFiles[0].path;
  } catch (err) {
    console.error('❌ Error finding recordings:', err.message);
    process.exit(1);
  }
}

async function transcribeFile(filePath) {
  try {
    console.log('\n=== Starting Transcription Process ===');
    console.log(`🔍 Input File: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    // Read file and log detailed stats
    const audioBuffer = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    console.log('\n📊 File Statistics:');
    console.log(`- Size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`- Created: ${stats.birthtime}`);
    console.log(`- Modified: ${stats.mtime}`);
    
    // Check file header
    const headerBytes = audioBuffer.slice(0, 16);
    console.log('\n🔍 File Header Analysis:');
    console.log('- First 16 bytes:', Buffer.from(headerBytes).toString('hex'));
    
    // Determine encoding based on file extension and header
    const fileExt = path.extname(filePath).toLowerCase();
    let encoding = 'LINEAR16'; // Default for WAV
    
    // More detailed format detection
    if (fileExt === '.mp3') {
      encoding = 'MP3';
      // Check for MP3 header (ID3 or MPEG frame sync)
      const isID3 = headerBytes[0] === 0x49 && headerBytes[1] === 0x44 && headerBytes[2] === 0x33;
      const isMPEG = (headerBytes[0] === 0xFF && (headerBytes[1] & 0xE0) === 0xE0);
      console.log('- Format: MP3');
      console.log(`- Has ID3 header: ${isID3}`);
      console.log(`- Has MPEG frame sync: ${isMPEG}`);
    } else if (fileExt === '.wav') {
      encoding = 'LINEAR16';
      const isRIFF = headerBytes.slice(0, 4).toString() === 'RIFF';
      console.log('- Format: WAV');
      console.log(`- Has RIFF header: ${isRIFF}`);
    }
    
    console.log(`\n🎵 Selected Encoding: ${encoding}`);
    
    // Convert audio to base64
    const base64Audio = audioBuffer.toString('base64');
    console.log('\n📦 Request Preparation:');
    console.log(`- Base64 length: ${base64Audio.length}`);
    console.log('- API Key length:', API_KEY ? API_KEY.length : 'No API key!');
    
    // Prepare request configuration
    const config = {
      encoding: encoding,
      sampleRateHertz: 44100,
      languageCode: 'en-US',
      enableAutomaticPunctuation: true,
      model: 'default',
      useEnhanced: true
    };
    
    console.log('\n⚙️ API Configuration:', JSON.stringify(config, null, 2));
    
    console.log('\n🚀 Sending request to Google Speech API...');
    const startTime = Date.now();
    
    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${API_KEY}`,
      {
        config: config,
        audio: {
          content: base64Audio
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Received response in ${duration} seconds`);
    
    console.log('\n📝 API Response Analysis:');
    console.log(`- Status: ${response.status}`);
    console.log(`- Has results: ${!!(response.data && response.data.results)}`);
    console.log(`- Number of results: ${response.data?.results?.length || 0}`);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      const transcription = response.data.results
        .map(result => {
          const confidence = result.alternatives[0].confidence;
          return `${result.alternatives[0].transcript} (confidence: ${(confidence * 100).toFixed(1)}%)`;
        })
        .join('\n');
      
      console.log('\n📝 Transcription Results:');
      console.log('=========================');
      console.log(transcription);
      console.log('=========================');
      
      // Save transcription to file for reference
      const transcriptionFile = `${filePath}.transcript.txt`;
      fs.writeFileSync(transcriptionFile, transcription);
      console.log(`\n💾 Transcription saved to: ${transcriptionFile}`);
      
      return transcription;
    } else {
      console.log('\n⚠️ No transcription results returned');
      console.log('Full API Response:', JSON.stringify(response.data, null, 2));
      return null;
    }
  } catch (error) {
    console.error('\n❌ Transcription Error:');
    
    if (error.response) {
      console.error('🔍 API Error Details:');
      console.error(`- Status: ${error.response.status}`);
      console.error(`- Status Text: ${error.response.statusText}`);
      console.error('- Error Data:', JSON.stringify(error.response.data, null, 2));
      console.error('- Headers:', JSON.stringify(error.response.headers, null, 2));
    } else if (error.request) {
      console.error('🔍 Network Error:');
      console.error('- No response received from API');
      console.error('- Request details:', error.request);
    } else {
      console.error('🔍 Error Details:');
      console.error(`- Message: ${error.message}`);
      console.error(`- Stack: ${error.stack}`);
    }
    
    return null;
  }
}

// Main function
async function main() {
  try {
    // Test specific file
    const targetFile = '/Users/amirdor/Documents/Friday Recordings/mic-recording-1747965131543_mic.mp3';
    console.log('\n🎯 Testing specific file:', targetFile);
    await transcribeFile(targetFile);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// Run the script
main(); 