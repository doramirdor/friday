#!/usr/bin/env node
/**
 * Test script to directly run the Swift recorder for MICROPHONE ONLY
 * This simplified test helps isolate microphone recording issues from system audio issues
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎤 Simple Microphone-Only Recording Test');
console.log('======================================');

// Get the recorder path
const recorderPath = path.join(__dirname, 'src', 'swift', 'Recorder');

// Check if the recorder exists
if (!fs.existsSync(recorderPath)) {
  console.error(`Error: Recorder binary not found at ${recorderPath}`);
  process.exit(1);
}

// Make sure it's executable
fs.chmodSync(recorderPath, '755');

// Create destination directory if needed
const documentsPath = path.join(process.env.HOME, 'Documents');
const recordingsPath = path.join(documentsPath, 'Friday Recordings');
if (!fs.existsSync(recordingsPath)) {
  fs.mkdirSync(recordingsPath, { recursive: true });
}

console.log(`Recordings path: ${recordingsPath}`);

const filename = `mic-only-test-${Date.now()}`;
// Important: Use 'mic' instead of 'both' or 'system' to avoid screen recording permission issues
const args = ['--record', recordingsPath, '--filename', filename, '--source', 'mic'];

console.log(`Running command: ${recorderPath} ${args.join(' ')}`);

// Run with spawn to capture all output
const recorderProcess = spawn(recorderPath, args);

console.log('🎙️ Microphone recording started - speak to test');
console.log('Press Ctrl+C to stop recording after 5-10 seconds');

let jsonFound = false;

// Handle stdout
recorderProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  
  // Check for RECORDING_STARTED
  if (output.includes('RECORDING_STARTED')) {
    console.log('✅ Recording successfully started!');
    jsonFound = true;
  }
  
  // Check for microphone issues
  if (output.includes('Microphone level is low')) {
    console.warn('⚠️ Warning: Microphone level is too low - check your volume settings');
  }
});

// Handle stderr
recorderProcess.stderr.on('data', (data) => {
  console.error(`Error: ${data.toString()}`);
});

// Set a delayed stop after 10 seconds
setTimeout(() => {
  if (!jsonFound) {
    console.log('⚠️ No RECORDING_STARTED message received after 10 seconds');
    console.log('   This indicates a problem with the recording initialization');
  }
  
  console.log('🛑 Stopping recording after 10 seconds...');
  recorderProcess.kill('SIGINT');
  
  // Wait a bit for the RECORDING_STOPPED message
  setTimeout(() => {
    if (!jsonFound) {
      console.log('❌ No recording status JSON messages were found.');
      console.log('   Check permissions and microphone connections.');
    }
    process.exit(0);
  }, 2000);
}, 10000);

// Handle process exit
recorderProcess.on('exit', (code) => {
  console.log(`Recorder process exited with code ${code}`);
});

// Handle process error
recorderProcess.on('error', (error) => {
  console.error(`Recorder process error: ${error.message}`);
  process.exit(1);
});

// Handle ctrl+c to gracefully stop recording
process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping recorder...');
  recorderProcess.kill('SIGINT');
}); 