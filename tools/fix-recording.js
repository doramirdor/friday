#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default recording directory
const DEFAULT_RECORDINGS_DIR = path.join(process.env.HOME, 'Documents', 'Friday Recordings');

// Helper function to run shell commands
function runCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error(`Error running command: ${command}`);
    console.error(error.message);
    return null;
  }
}

// Check if a file exists
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error(`Error checking if file exists: ${filePath}`);
    console.error(error.message);
    return false;
  }
}

// Log section header
function logSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`= ${title}`);
  console.log('='.repeat(80));
}

// Main diagnostic function
async function diagnoseRecordingIssues() {
  logSection('FRIDAY AUDIO RECORDING DIAGNOSTIC TOOL');
  console.log('This tool will help diagnose and fix issues with audio recordings.');

  // Check if recording directory exists
  logSection('Checking Recording Directory');
  if (fileExists(DEFAULT_RECORDINGS_DIR)) {
    console.log(`✅ Recording directory exists at: ${DEFAULT_RECORDINGS_DIR}`);
    
    // List recordings
    try {
      const files = fs.readdirSync(DEFAULT_RECORDINGS_DIR)
        .filter(file => file.endsWith('.mp3'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(DEFAULT_RECORDINGS_DIR, a));
          const statB = fs.statSync(path.join(DEFAULT_RECORDINGS_DIR, b));
          return statB.mtime.getTime() - statA.mtime.getTime(); // Sort by date, newest first
        });
      
      if (files.length === 0) {
        console.log('⚠️ No MP3 recordings found in the directory.');
      } else {
        console.log(`Found ${files.length} MP3 recordings. Most recent recordings:`);
        files.slice(0, 5).forEach((file, index) => {
          const filePath = path.join(DEFAULT_RECORDINGS_DIR, file);
          const stats = fs.statSync(filePath);
          const fileSize = (stats.size / 1024).toFixed(2);
          console.log(`${index + 1}. ${file} (${fileSize} KB) - ${stats.mtime.toLocaleString()}`);
        });
        
        // Analyze the most recent recording
        if (files.length > 0) {
          const mostRecentFile = files[0];
          const filePath = path.join(DEFAULT_RECORDINGS_DIR, mostRecentFile);
          await analyzeAudioFile(filePath);
        }
      }
    } catch (error) {
      console.error(`❌ Error listing recordings: ${error.message}`);
    }
  } else {
    console.error(`❌ Recording directory does not exist at: ${DEFAULT_RECORDINGS_DIR}`);
    
    // Try to create the directory
    try {
      fs.mkdirSync(DEFAULT_RECORDINGS_DIR, { recursive: true });
      console.log(`✅ Created recording directory at: ${DEFAULT_RECORDINGS_DIR}`);
    } catch (error) {
      console.error(`❌ Failed to create recording directory: ${error.message}`);
    }
  }
  
  // Check for ffmpeg
  logSection('Checking Required Tools');
  const ffmpegVersion = runCommand('ffmpeg -version');
  if (ffmpegVersion) {
    console.log(`✅ ffmpeg installed: ${ffmpegVersion.split('\n')[0]}`);
  } else {
    console.error('❌ ffmpeg not found. Please install ffmpeg to enable audio recording functionality.');
    console.log('   You can install ffmpeg with: brew install ffmpeg');
  }
  
  // Check the Swift recorder
  const recorderPath = path.join(process.cwd(), 'src', 'swift', 'Recorder');
  if (fileExists(recorderPath)) {
    console.log(`✅ Swift Recorder binary exists at: ${recorderPath}`);
    
    // Check permissions
    try {
      const permissions = runCommand(`ls -la "${recorderPath}"`);
      console.log(`   Permissions: ${permissions}`);
      
      if (!permissions.includes('x')) {
        console.log('⚠️ Recorder binary may not be executable. Fixing permissions...');
        runCommand(`chmod +x "${recorderPath}"`);
        console.log('   Permissions updated.');
      }
    } catch (error) {
      console.error(`❌ Error checking recorder permissions: ${error.message}`);
    }
  } else {
    console.error(`❌ Swift Recorder binary not found at: ${recorderPath}`);
  }
  
  // Create a test recording
  logSection('Creating Test Recording');
  console.log('Creating a test recording to diagnose issues...');
  
  const testFilePath = path.join(DEFAULT_RECORDINGS_DIR, `test_recording_${Date.now()}.mp3`);
  
  try {
    // Generate a proper test file with a tone
    runCommand(`ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -q:a 2 "${testFilePath}" -y`);
    
    if (fileExists(testFilePath)) {
      console.log(`✅ Test recording created at: ${testFilePath}`);
      await analyzeAudioFile(testFilePath);
      
      // Try to play the file
      console.log('\nAttempting to verify the test recording...');
      const fileType = runCommand(`file "${testFilePath}"`);
      console.log(`File type: ${fileType}`);
      
      // Check if it's a valid audio file
      if (fileType.toLowerCase().includes('mp3') || fileType.toLowerCase().includes('audio')) {
        console.log('✅ Test file appears to be a valid audio file.');
      } else {
        console.error('❌ Test file does not appear to be a valid audio file.');
      }
    } else {
      console.error(`❌ Failed to create test recording at: ${testFilePath}`);
    }
  } catch (error) {
    console.error(`❌ Error creating test recording: ${error.message}`);
  }
  
  // Fix the software recording flag
  logSection('Fixing Recording Settings');
  
  const recordingJsPath = path.join(process.cwd(), 'src', 'electron', 'main', 'utils', 'recording.js');
  if (fileExists(recordingJsPath)) {
    console.log('Checking recording.js for software recording mode settings...');
    
    try {
      const content = fs.readFileSync(recordingJsPath, 'utf8');
      if (content.includes('useSoftwareRecordingMode = true')) {
        console.log('⚠️ Software recording mode is enabled. This might be causing empty recordings.');
        console.log('   Recommend changing to: useSoftwareRecordingMode = false');
      } else {
        console.log('✅ Software recording mode is not enabled by default.');
      }
    } catch (error) {
      console.error(`❌ Error checking recording.js: ${error.message}`);
    }
  } else {
    console.error(`❌ Recording.js not found at: ${recordingJsPath}`);
  }
  
  // Recommendations
  logSection('Recommendations');
  console.log('Based on diagnostics, here are some recommendations:');
  console.log('1. Update to use the proper Swift recorder instead of software recording mode');
  console.log('2. Ensure microphone permissions are granted in System Settings');
  console.log('3. Make sure your microphone is not muted and input volume is turned up');
  console.log('4. For system audio recording, ensure Screen Recording permission is granted');
  console.log('5. Try using combined recording mode (both microphone and system audio)');
  console.log('6. Check for ffmpeg to ensure proper recording file generation');
}

// Analyze an audio file for diagnostic purposes
async function analyzeAudioFile(filePath) {
  console.log(`\nAnalyzing audio file: ${filePath}`);
  console.log('-'.repeat(50));
  
  try {
    // Basic file info
    const stats = fs.statSync(filePath);
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    
    if (stats.size < 1024) {
      console.warn('⚠️  WARNING: File is suspiciously small for audio content.');
    }
    
    // Check file type
    const fileType = runCommand(`file "${filePath}"`);
    console.log(`File type: ${fileType}`);
    
    // Try to get audio info using ffprobe
    try {
      console.log('\nAudio File Information:');
      console.log('-'.repeat(50));
      
      const probeOutput = runCommand(`ffprobe -v error -show_format -show_streams "${filePath}" 2>&1`);
      if (probeOutput) {
        console.log(probeOutput);
      } else {
        console.log('❌ Unable to get audio information with ffprobe');
      }
      
      // Check for silence
      console.log('\nChecking for audio content:');
      
      // This will detect silence as periods where audio level is below -50dB
      const silenceOutput = runCommand(
        `ffmpeg -i "${filePath}" -af silencedetect=noise=-50dB:d=1 -f null - 2>&1`
      );
      
      if (silenceOutput) {
        const silenceMatches = silenceOutput.match(/silence_start: [\d\.]+ \| silence_end: [\d\.]+ \| silence_duration: [\d\.]+/g);
        
        if (silenceMatches && silenceMatches.length > 0) {
          console.log('Detected silent periods:');
          silenceMatches.forEach(match => console.log(`  ${match}`));
          
          // Calculate total silence duration
          let totalSilence = 0;
          const durationMatches = silenceOutput.match(/silence_duration: ([\d\.]+)/g);
          if (durationMatches) {
            durationMatches.forEach(match => {
              const duration = parseFloat(match.replace('silence_duration: ', ''));
              totalSilence += duration;
            });
          }
          
          // Extract duration info if available
          let totalDuration = 0;
          if (probeOutput) {
            const durationLine = probeOutput.split('\n').find(line => line.startsWith('duration='));
            if (durationLine) {
              totalDuration = parseFloat(durationLine.split('=')[1]);
            }
          }
          
          console.log(`\nSilence analysis:`);
          console.log(`  Total silence detected: ${totalSilence.toFixed(2)} seconds`);
          
          if (totalDuration > 0) {
            const silencePercentage = (totalSilence / totalDuration) * 100;
            console.log(`  Total duration: ${totalDuration.toFixed(2)} seconds`);
            console.log(`  Silence percentage: ${silencePercentage.toFixed(2)}%`);
            
            if (silencePercentage > 95) {
              console.warn('⚠️  WARNING: File appears to be mostly silence (>95%). This may indicate a recording issue.');
            }
          }
        } else {
          console.log('No silence detected in the file, which is unusual.');
        }
      } else {
        console.log('❌ Unable to analyze silence with ffmpeg');
      }
    } catch (err) {
      console.error(`Error analyzing audio file: ${err.message}`);
    }
  } catch (err) {
    console.error(`Error analyzing file: ${err.message}`);
  }
}

// Run the diagnostic
diagnoseRecordingIssues().catch(error => {
  console.error('An error occurred during diagnosis:', error);
}); 