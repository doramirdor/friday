#!/usr/bin/env node
/**
 * Test script to directly run the Swift recorder and check output
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the recorder path
const recorderPath = path.join(__dirname, 'src', 'swift', 'Recorder');

// Check if the recorder exists
if (!fs.existsSync(recorderPath)) {
  console.error(`Error: Recorder binary not found at ${recorderPath}`);
  process.exit(1);
}

// Get file stats and make sure it's executable
const stats = fs.statSync(recorderPath);
console.log(`Recorder file size: ${stats.size} bytes`);
console.log(`Permissions: ${stats.mode.toString(8).slice(-3)}`);

// Make sure it's executable
if (!(stats.mode & 0o111)) {
  console.log('Making recorder executable with chmod +x');
  try {
    fs.chmodSync(recorderPath, '755');
  } catch (error) {
    console.error(`Error making recorder executable: ${error.message}`);
  }
}

// Create destination directory if needed
const documentsPath = path.join(process.env.HOME, 'Documents');
const recordingsPath = path.join(documentsPath, 'Friday Recordings');
if (!fs.existsSync(recordingsPath)) {
  console.log(`Creating recordings directory: ${recordingsPath}`);
  fs.mkdirSync(recordingsPath, { recursive: true });
}

// Run the recorder with arguments
console.log(`Running recorder: ${recorderPath}`);
console.log(`Recordings path: ${recordingsPath}`);

const filename = `test-recording-${Date.now()}`;
const args = ['--record', recordingsPath, '--filename', filename, '--source', 'both'];

console.log(`Command: ${recorderPath} ${args.join(' ')}`);

// Run with spawn to capture all output
const recorderProcess = spawn(recorderPath, args);

console.log('Recorder process started');

// Set a timeout to kill the process after 60 seconds
const timeout = setTimeout(() => {
  console.log('Test timeout reached (60 seconds), killing recorder process');
  recorderProcess.kill('SIGINT');
}, 60000);

// Handle stdout
recorderProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`Recorder stdout: ${output}`);
  
  // Look for JSON responses
  try {
    // Try to parse each line as JSON
    const lines = output.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        console.log('Parsed JSON response:', json);
      } catch {
        // Not JSON, just regular output
      }
    }
  } catch (error) {
    console.log('Error parsing JSON from output:', error.message);
  }
});

// Handle stderr
recorderProcess.stderr.on('data', (data) => {
  console.error(`Recorder stderr: ${data.toString()}`);
});

// Handle process exit
recorderProcess.on('exit', (code, signal) => {
  clearTimeout(timeout);
  console.log(`Recorder process exited with code ${code} and signal ${signal}`);
  process.exit(0);
});

// Handle process error
recorderProcess.on('error', (error) => {
  clearTimeout(timeout);
  console.error(`Recorder process error: ${error.message}`);
  process.exit(1);
});

// Handle ctrl+c to gracefully stop recording
process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping recorder...');
  recorderProcess.kill('SIGINT');
});

console.log('Waiting for recorder output...'); 