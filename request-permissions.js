#!/usr/bin/env node
/**
 * Permission Request Script for macOS
 * 
 * This script helps users request and check for microphone and screen recording
 * permissions on macOS.
 */
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔒 Friday Permissions Helper');
console.log('==========================');
console.log('This utility helps set up proper permissions for recording.');

// Find the recorder binary
const recorderPath = path.join(__dirname, 'src', 'swift', 'Recorder');
if (!fs.existsSync(recorderPath)) {
  console.error('❌ Error: Swift recorder binary not found at', recorderPath);
  console.log('Please make sure you have built the Swift recorder properly.');
  process.exit(1);
}

// Make the binary executable
try {
  fs.chmodSync(recorderPath, '755');
  console.log('✅ Made recorder executable');
} catch (err) {
  console.error('❌ Error setting permissions:', err.message);
}

// First check microphone permission
console.log('\n1️⃣ Checking microphone permission...');
const micProcess = spawn(recorderPath, ['--check-permissions']);

micProcess.stdout.on('data', (data) => {
  const output = data.toString().trim();
  console.log(output);
  if (output.includes('PERMISSION_GRANTED')) {
    console.log('✅ Microphone permission is granted');
  } else if (output.includes('PERMISSION_DENIED')) {
    console.log('❌ Microphone permission is denied');
    openMicrophoneSettings();
  }
});

micProcess.on('exit', (code) => {
  console.log(`\n2️⃣ Checking screen recording permission...`);
  checkScreenRecordingPermission();
});

// Function to open microphone settings
function openMicrophoneSettings() {
  console.log('📱 Opening microphone permission settings...');
  exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"');
  console.log('Please grant Friday permission to access the microphone.');
}

// Function to check screen recording permission
function checkScreenRecordingPermission() {
  const checkProcess = spawn(recorderPath, ['--record', '/tmp', '--source', 'system', '--check-permissions']);
  
  checkProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    console.log(output);
    
    if (output.includes('PERMISSION_DENIED')) {
      console.log('❌ Screen recording permission is denied');
      openScreenRecordingSettings();
    } else if (output.includes('PERMISSION_GRANTED')) {
      console.log('✅ Screen recording permission is granted');
    }
  });
  
  checkProcess.on('exit', () => {
    console.log('\n🎯 Permission Check Complete');
    console.log('If any permissions are missing, please:');
    console.log('1. Open System Settings > Privacy & Security');
    console.log('2. Find "Microphone" and "Screen Recording" in the list');
    console.log('3. Ensure Friday is checked in both sections');
    console.log('4. Restart Friday after granting permissions');
  });
}

// Function to open screen recording settings
function openScreenRecordingSettings() {
  console.log('📱 Opening screen recording permission settings...');
  exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"');
  console.log('Please grant Friday permission to record the screen.');
} 