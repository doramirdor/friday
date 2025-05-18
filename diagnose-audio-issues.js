#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(exec);
const readline = require('readline');

/**
 * Audio Recording Diagnostic Tool for Friday App
 * 
 * This tool helps diagnose issues with microphone recording, focusing on:
 * 1. Verifying microphone permissions
 * 2. Testing microphone recording directly
 * 3. Diagnosing recorded files for content
 * 4. Checking system audio routing
 */

// ANSI colors for better output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

// Print tool header
console.log(`${colors.bold}${colors.cyan}Friday App Audio Recording Diagnostic Tool${colors.reset}`);
console.log(`${colors.bold}============================================${colors.reset}`);

async function runTest() {
  try {
    // Test 1: Check microphone permissions
    console.log(`\n${colors.bold}${colors.blue}1. Checking microphone permissions${colors.reset}`);
    
    try {
      const permResult = await execAsync('osascript -e "tell application \\"System Events\\" to get the UI elements enabled of process \\"Friday\\"" 2>/dev/null');
      console.log(`${colors.green}✓ System Events permissions granted${colors.reset}`);
    } catch (error) {
      console.log(`${colors.yellow}⚠ Unable to verify System Events permissions: ${error.message}${colors.reset}`);
      console.log(`${colors.yellow}  Please check manually in System Settings > Privacy & Security > Microphone${colors.reset}`);
    }
    
    // Test 2: Check microphone configuration
    console.log(`\n${colors.bold}${colors.blue}2. Checking microphone configuration${colors.reset}`);
    
    try {
      const micVolume = await execAsync('osascript -e "input volume of (get volume settings)"');
      const volume = parseInt(micVolume.stdout.trim());
      
      if (volume === 0) {
        console.log(`${colors.red}✗ Microphone input volume is set to 0${colors.reset}`);
        console.log(`${colors.yellow}  Please increase the microphone volume in System Settings > Sound > Input${colors.reset}`);
      } else {
        console.log(`${colors.green}✓ Microphone input volume: ${volume}%${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Unable to check microphone volume: ${error.message}${colors.reset}`);
    }
    
    try {
      const audioDevices = await execAsync('system_profiler SPAudioDataType');
      
      // Extract input devices
      const audioData = audioDevices.stdout;
      const inputSection = audioData.split('Input Devices:')[1]?.split('Output Devices:')[0] || '';
      
      if (inputSection.trim()) {
        console.log(`${colors.green}✓ Audio input devices found:${colors.reset}`);
        
        // Parse and display input devices
        const devices = inputSection.split('\n')
          .filter(line => line.trim() && !line.includes('Input Devices:'))
          .map(line => line.trim())
          .filter(line => line !== '');
        
        devices.forEach(device => {
          console.log(`  - ${device}`);
        });
      } else {
        console.log(`${colors.red}✗ No audio input devices found${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠ Unable to check audio devices: ${error.message}${colors.reset}`);
    }
    
    // Test 3: Check recording directory
    console.log(`\n${colors.bold}${colors.blue}3. Checking recording directory${colors.reset}`);
    
    const recordingsPath = path.join(process.env.HOME, 'Documents', 'Friday Recordings');
    
    if (fs.existsSync(recordingsPath)) {
      console.log(`${colors.green}✓ Recordings directory exists: ${recordingsPath}${colors.reset}`);
      
      // List files in the directory
      const files = fs.readdirSync(recordingsPath)
        .filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));
      
      if (files.length > 0) {
        console.log(`${colors.green}✓ Found ${files.length} audio recordings:${colors.reset}`);
        
        // Display the most recent recordings first (up to 5)
        const fileStats = files.map(file => {
          const filePath = path.join(recordingsPath, file);
          const stats = fs.statSync(filePath);
          
          return {
            name: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime
          };
        });
        
        // Sort by modification time (most recent first)
        fileStats.sort((a, b) => b.modified - a.modified);
        
        fileStats.slice(0, 5).forEach(file => {
          const sizeKB = (file.size / 1024).toFixed(2);
          console.log(`  - ${file.name} (${sizeKB} KB, modified: ${file.modified.toLocaleString()})`);
          
          if (file.size < 1024) {
            console.log(`    ${colors.red}⚠ File size is suspiciously small (${sizeKB} KB)${colors.reset}`);
          }
        });
      } else {
        console.log(`${colors.yellow}⚠ No audio recordings found in ${recordingsPath}${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}✗ Recordings directory does not exist: ${recordingsPath}${colors.reset}`);
    }
    
    // Test 4: Test microphone recording directly
    console.log(`\n${colors.bold}${colors.blue}4. Test microphone recording${colors.reset}`);
    console.log(`${colors.yellow}Would you like to test the microphone by recording a short sample? (y/n)${colors.reset}`);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('> ', async (answer) => {
      if (answer.toLowerCase() === 'y') {
        console.log(`${colors.cyan}Recording for 5 seconds... Please speak into your microphone.${colors.reset}`);
        
        const testRecordingPath = path.join(recordingsPath, 'mic_test.wav');
        
        try {
          // Record using either ffmpeg or sox, whichever is available
          let recordingCommand;
          try {
            await execAsync('which ffmpeg');
            recordingCommand = `ffmpeg -f avfoundation -i ":0" -t 5 "${testRecordingPath}" -y`;
          } catch {
            try {
              await execAsync('which sox');
              recordingCommand = `sox -d -t wav "${testRecordingPath}" trim 0 5`;
            } catch {
              throw new Error('Neither ffmpeg nor sox is installed');
            }
          }
          
          // Start recording
          await execAsync(recordingCommand);
          
          console.log(`${colors.green}✓ Recording completed and saved to: ${testRecordingPath}${colors.reset}`);
          
          // Analyze the recording
          if (fs.existsSync(testRecordingPath)) {
            const stats = fs.statSync(testRecordingPath);
            console.log(`${colors.cyan}Analyzing the test recording...${colors.reset}`);
            
            if (stats.size < 1000) {
              console.log(`${colors.red}✗ Test recording file is too small (${stats.size} bytes), which suggests no audio was captured${colors.reset}`);
            } else {
              console.log(`${colors.green}✓ Test recording size: ${(stats.size / 1024).toFixed(2)} KB${colors.reset}`);
              
              // Check for silence
              try {
                const silenceOutput = await execAsync(`ffmpeg -i "${testRecordingPath}" -af silencedetect=noise=-50dB:d=1 -f null - 2>&1`);
                
                if (silenceOutput.stdout.includes('silence_duration') || silenceOutput.stderr.includes('silence_duration')) {
                  console.log(`${colors.yellow}⚠ Periods of silence detected in the recording${colors.reset}`);
                } else {
                  console.log(`${colors.green}✓ Audio content detected in the recording${colors.reset}`);
                }
              } catch (error) {
                console.log(`${colors.yellow}⚠ Unable to analyze silence: ${error.message}${colors.reset}`);
              }
              
              // Play the recording back
              console.log(`${colors.yellow}Would you like to play back the test recording? (y/n)${colors.reset}`);
              
              rl.question('> ', async (answer) => {
                if (answer.toLowerCase() === 'y') {
                  try {
                    await execAsync(`afplay "${testRecordingPath}"`);
                    console.log(`${colors.green}✓ Playback completed${colors.reset}`);
                  } catch (error) {
                    console.log(`${colors.red}✗ Error playing back recording: ${error.message}${colors.reset}`);
                  }
                  
                  displaySummaryAndRecommendations();
                  rl.close();
                } else {
                  displaySummaryAndRecommendations();
                  rl.close();
                }
              });
            }
          } else {
            console.log(`${colors.red}✗ Test recording file was not created${colors.reset}`);
            displaySummaryAndRecommendations();
            rl.close();
          }
        } catch (error) {
          console.log(`${colors.red}✗ Error during recording test: ${error.message}${colors.reset}`);
          displaySummaryAndRecommendations();
          rl.close();
        }
      } else {
        displaySummaryAndRecommendations();
        rl.close();
      }
    });
  } catch (error) {
    console.error(`${colors.red}Error running diagnostics: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

function displaySummaryAndRecommendations() {
  console.log(`\n${colors.bold}${colors.blue}Recommendations:${colors.reset}`);
  console.log(`${colors.cyan}1. Ensure your microphone is not muted in System Settings > Sound > Input${colors.reset}`);
  console.log(`${colors.cyan}2. Check that the Friday app has permission to access your microphone${colors.reset}`);
  console.log(`${colors.cyan}3. Try a different microphone if available${colors.reset}`);
  console.log(`${colors.cyan}4. When using "Both" recording mode, try the microphone-only mode first to isolate issues${colors.reset}`);
  console.log(`${colors.cyan}5. Check system logs for "Mic levels" entries showing if audio is being detected${colors.reset}`);
  console.log(`${colors.cyan}6. Verify that your microphone works in other applications${colors.reset}`);
}

// Run the test suite
runTest(); 