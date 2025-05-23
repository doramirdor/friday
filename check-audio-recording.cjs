#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Audio Recording Diagnostic Tool
 * 
 * This script analyzes audio files to verify they contain valid audio data.
 * It can help diagnose issues with recordings that don't playback properly.
 * 
 * Usage: node check-audio-recording.cjs <path-to-audio-file>
 */

// Check args
if (process.argv.length < 3) {
  console.error('Usage: node check-audio-recording.cjs <path-to-audio-file>');
  process.exit(1);
}

// Get the file path
const filePath = process.argv[2];
if (!fs.existsSync(filePath)) {
  console.error(`Error: File "${filePath}" does not exist.`);
  process.exit(1);
}

console.log(`Analyzing audio file: ${filePath}`);
console.log('-'.repeat(50));

// Basic file info
try {
  const stats = fs.statSync(filePath);
  console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
  
  if (stats.size < 1024) {
    console.warn('⚠️  WARNING: File is suspiciously small for audio content.');
  }
  
  console.log(`Created: ${stats.birthtime}`);
  console.log(`Last modified: ${stats.mtime}`);
} catch (err) {
  console.error(`Error getting file stats: ${err.message}`);
}

// Check file type using file command if available
try {
  const fileType = execSync(`file "${filePath}"`).toString().trim();
  console.log(`File type: ${fileType}`);
} catch (err) {
  console.log(`Could not determine file type: ${err.message}`);
}

// Check if the file is actually an HTML file with wrong extension
try {
  const buffer = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r', start: 0, end: 1000 });
  if (buffer.includes('<!DOCTYPE html>') || buffer.includes('<html')) {
    console.warn('\n⚠️ WARNING: This appears to be an HTML file with an MP3 extension!');
    console.warn('   - This is likely due to a recording error or network issue');
    console.warn('   - The file WILL NOT play correctly as an audio file');
    console.warn('   - Check the recording process and ensure proper error handling\n');
  }
} catch (err) {
  // The read might fail if it's a binary file, which is expected for MP3s
  console.log('File appears to be binary (normal for audio files)');
}

// Try to get audio info using ffprobe
try {
  console.log('\nAudio File Information:');
  console.log('-'.repeat(50));
  
  const probeOutput = execSync(`ffprobe -v error -show_format -show_streams "${filePath}" 2>&1`).toString();
  console.log(probeOutput);
  
  // Check for silence using silencedetect filter
  console.log('\nChecking for audio content:');
  console.log('-'.repeat(50));
  
  // This will detect silence as periods where audio level is below -50dB
  const silenceOutput = execSync(
    `ffmpeg -i "${filePath}" -af silencedetect=noise=-50dB:d=1 -f null - 2>&1`
  ).toString();
  
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
    const durationLine = probeOutput.split('\n').find(line => line.startsWith('duration='));
    if (durationLine) {
      totalDuration = parseFloat(durationLine.split('=')[1]);
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
    console.log('No silence detected in the file.');
  }
  
  // Generate spectrogram
  const spectrogramPath = path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}_spectrogram.png`);
  try {
    execSync(`ffmpeg -i "${filePath}" -lavfi showspectrumpic=s=1200x600 "${spectrogramPath}" -y`);
    console.log(`\nGenerated spectrogram image: ${spectrogramPath}`);
  } catch (err) {
    console.error(`Error generating spectrogram: ${err.message}`);
  }
  
  // Generate waveform
  const waveformPath = path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}_waveform.png`);
  try {
    execSync(`ffmpeg -i "${filePath}" -filter_complex "showwavespic=s=1200x400:colors=blue" "${waveformPath}" -y`);
    console.log(`Generated waveform image: ${waveformPath}`);
  } catch (err) {
    console.error(`Error generating waveform: ${err.message}`);
  }
  
} catch (err) {
  console.error(`Error analyzing audio file with ffprobe/ffmpeg: ${err.message}`);
  console.log('\nBasic file header analysis:');
  
  try {
    // Read first 32 bytes for header inspection
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(32);
    fs.readSync(fd, buffer, 0, 32, 0);
    fs.closeSync(fd);
    
    console.log('File header (hex):');
    console.log(buffer.toString('hex').match(/../g).join(' '));
    
    // Look for common audio file signatures
    const header = buffer.toString('hex');
    if (header.startsWith('494433')) {
      console.log('Detected file format: MP3 (ID3)');
    } else if (header.startsWith('fff')) {
      console.log('Detected file format: MP3 (no ID3)');
    } else if (header.startsWith('52494646')) {
      console.log('Detected file format: WAV (RIFF)');
    } else if (header.startsWith('4f676753')) {
      console.log('Detected file format: OGG');
    } else if (header.startsWith('664c6143')) {
      console.log('Detected file format: FLAC');
    } else {
      console.log('Unknown audio format or not an audio file');
    }
  } catch (e) {
    console.error(`Error reading file header: ${e.message}`);
  }
}

console.log('\nDiagnostic Information:');
console.log('-'.repeat(50));

// Check FFmpeg and Swift recorder versions
try {
  console.log('FFmpeg version:');
  console.log(execSync('ffmpeg -version').toString().split('\n')[0]);
} catch (err) {
  console.error('FFmpeg not found or could not be executed');
}

console.log('\nTroubleshooting Recommendations:');
console.log('-'.repeat(50));
console.log('1. Check if the microphone has permission in System Settings');
console.log('2. Verify that your microphone is selected and working in System Sound Settings');
console.log('3. Try a microphone-only recording to isolate potential issues');
console.log('4. If waveform shows no audio spikes, your microphone may not be recording correctly');
console.log('5. Review the Swift recorder logs for "Microphone level is low" warnings');
console.log('6. Ensure your microphone is not muted and input volume is turned up');

console.log('\nRecording Status Check:');
console.log('-'.repeat(50));
console.log('1. Is this a valid audio file?', !fileType.includes('HTML') && !fileType.includes('text'));
console.log('2. Is this file empty or suspiciously small?', stats.size < 1024);
console.log(`3. What recording mode was used? ${fileType.includes('HTML') ? 'Software mode (incorrect)' : 'Likely Swift recorder'}`);
console.log('4. Recommended fix: Make sure useSoftwareRecordingMode=false in src/electron/main/utils/recording.js');
console.log('   - If you\'re seeing HTML files, this indicates a fallback issue where the software recording mode is generating invalid files') 