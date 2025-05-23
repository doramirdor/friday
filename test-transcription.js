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
    console.log(`🔍 Transcribing file: ${filePath}`);
    
    // Read file
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`📊 File size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);
    
    // Determine encoding based on file extension
    const fileExt = path.extname(filePath).toLowerCase();
    let encoding = 'LINEAR16'; // Default for WAV
    
    if (fileExt === '.mp3') {
      encoding = 'MP3';
      console.log('🎵 Detected MP3 format');
    } else if (fileExt === '.ogg') {
      encoding = 'OGG_OPUS';
      console.log('🎵 Detected OGG format');
    } else if (fileExt === '.wav') {
      encoding = 'LINEAR16';
      console.log('🎵 Detected WAV format');
    } else {
      console.log(`⚠️ Unknown file extension: ${fileExt}, defaulting to LINEAR16`);
    }
    
    // Convert audio to base64
    const base64Audio = audioBuffer.toString('base64');
    
    console.log('🚀 Sending request to Google Speech API...');
    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${API_KEY}`,
      {
        config: {
          encoding: encoding,
          sampleRateHertz: 44100,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'default'
        },
        audio: {
          content: base64Audio
        }
      }
    );
    
    console.log('✅ Received response from Google Speech API');
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      const transcription = response.data.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      
      console.log('\n📝 Transcription:');
      console.log('-------------------');
      console.log(transcription);
      console.log('-------------------');
      return transcription;
    } else {
      console.log('⚠️ No transcription results returned');
      console.log('API Response:', JSON.stringify(response.data, null, 2));
      return null;
    }
  } catch (error) {
    console.error('❌ Error transcribing file:');
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('💥 API Error:', error.response.status);
      console.error('💥 Error data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // The request was made but no response was received
      console.error('💥 No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('💥 Error:', error.message);
    }
    
    return null;
  }
}

// Main function
async function main() {
  try {
    // Get latest recording
    const latestRecording = await getLatestRecording();
    
    // Transcribe it
    await transcribeFile(latestRecording);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// Run the script
main(); 