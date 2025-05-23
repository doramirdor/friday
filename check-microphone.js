#!/usr/bin/env node
/**
 * Microphone Volume Check Utility
 * 
 * This script helps diagnose microphone volume issues by:
 * 1. Checking the current microphone volume
 * 2. Testing if the microphone is working properly
 * 3. Providing guidance on how to fix common issues
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎤 Friday Microphone Volume Check Utility');
console.log('=========================================');
console.log('This utility will check your microphone volume settings and help you fix issues.');
console.log();

// Find the recorder binary
const recorderPath = path.join(__dirname, 'src', 'swift', 'Recorder');
if (!fs.existsSync(recorderPath)) {
  console.error('❌ Error: Swift recorder binary not found at', recorderPath);
  console.log('Please make sure you have built the Swift recorder properly.');
  process.exit(1);
}

// Make the binary executable
try {
  const stats = fs.statSync(recorderPath);
  console.log(`📊 Recorder file: ${recorderPath}`);
  console.log(`   - Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`   - Permissions: ${stats.mode.toString(8).slice(-3)}`);
  
  // Ensure it's executable
  if (!(stats.mode & 0o111)) {
    console.log('📝 Making recorder executable with chmod +x');
    fs.chmodSync(recorderPath, '755');
    console.log('✅ Permissions updated');
  }
} catch (err) {
  console.error('❌ Error checking recorder binary:', err.message);
  process.exit(1);
}

// Run the recorder with a special flag just to check microphone
console.log('\n🔍 Checking microphone volume...');
const args = ['--check-permissions'];
const recorderProcess = spawn(recorderPath, args);

let output = '';
let micLevelFound = false;

recorderProcess.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.log(text);
  
  // Try to extract microphone level
  const match = text.match(/Microphone input volume: (\d+(\.\d+)?)%/);
  if (match) {
    const level = parseFloat(match[1]);
    micLevelFound = true;
    
    if (level < 10) {
      console.log('\n⚠️ WARNING: Your microphone volume is VERY LOW (' + level + '%)');
      console.log('This will likely result in silent recordings.');
    } else if (level < 30) {
      console.log('\n⚠️ WARNING: Your microphone volume is LOW (' + level + '%)');
      console.log('This may result in quiet recordings that are hard to hear.');
    } else if (level > 30 && level < 70) {
      console.log('\n✅ Your microphone volume is GOOD (' + level + '%)');
    } else if (level >= 70) {
      console.log('\n✅ Your microphone volume is HIGH (' + level + '%)');
      console.log('This is good for recording, but you may want to adjust it if there\'s distortion.');
    }
  }
});

recorderProcess.stderr.on('data', (data) => {
  console.error(`${data.toString()}`);
});

// Once the process is done, provide recommendations
recorderProcess.on('exit', () => {
  console.log('\n📋 Microphone Check Results');
  console.log('=========================');
  
  if (!micLevelFound) {
    console.log('❌ Could not detect microphone volume level.');
    console.log('Possible reasons:');
    console.log('1. Microphone permissions are not granted');
    console.log('2. No microphone is connected or detected');
    console.log('3. System audio settings are misconfigured');
  }
  
  console.log('\n🔧 How to fix microphone volume issues:');
  console.log('1. Open System Preferences > Sound > Input');
  console.log('2. Select your microphone from the list');
  console.log('3. Adjust the "Input volume" slider to increase volume');
  console.log('4. Speak into the microphone and ensure the input level meter responds');
  console.log('5. Make sure your microphone is not muted (no red X on the microphone icon)');
  
  console.log('\n📱 Additional troubleshooting:');
  console.log('1. Try disconnecting and reconnecting your microphone');
  console.log('2. Try a different microphone if available');
  console.log('3. Check if your microphone works in other applications');
  console.log('4. Restart your computer if all else fails');
  
  console.log('\n👋 Once your microphone volume is properly set up, recordings should work correctly!');
  
  process.exit(0);
});

// Handle timeout
setTimeout(() => {
  console.log('\n⚠️ Test timed out after 10 seconds');
  recorderProcess.kill();
}, 10000); 