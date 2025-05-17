const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { dialog } = require('electron');

const execAsync = promisify(exec);

/**
 * Run diagnostics to identify recording and conversion issues
 * @param {string} outputPath Path to check for files
 */
async function runRecordingDiagnostics(outputPath) {
  const results = {
    system: {},
    directory: {},
    ffmpeg: {},
    issues: []
  };

  try {
    // 1. Check system environment
    results.system.os = process.platform;
    results.system.arch = process.arch;
    results.system.node = process.version;
    results.system.electron = process.versions.electron;
    
    // 2. Check if output directory exists and is writable
    try {
      results.directory.exists = fs.existsSync(outputPath);
      if (!results.directory.exists) {
        results.issues.push(`Output directory doesn't exist: ${outputPath}`);
      } else {
        // Check if directory is writable
        const testFile = path.join(outputPath, `test-${Date.now()}.txt`);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        results.directory.writable = true;
        
        // List files in the directory
        results.directory.files = fs.readdirSync(outputPath)
          .map(file => {
            const filePath = path.join(outputPath, file);
            const stats = fs.statSync(filePath);
            return {
              name: file,
              size: stats.size,
              isDirectory: stats.isDirectory(),
              created: stats.birthtime,
              modified: stats.mtime,
              extension: path.extname(file)
            };
          });
        
        // Check for FLAC files
        const flacFiles = results.directory.files.filter(f => f.extension.toLowerCase() === '.flac');
        results.directory.flacCount = flacFiles.length;
        
        // Check for MP3 files
        const mp3Files = results.directory.files.filter(f => f.extension.toLowerCase() === '.mp3');
        results.directory.mp3Count = mp3Files.length;
        
        if (flacFiles.length > 0 && mp3Files.length === 0) {
          results.issues.push('FLAC files exist but no MP3 files - conversion may be failing');
        }
      }
    } catch (error) {
      results.directory.error = error.message;
      results.issues.push(`Error accessing directory: ${error.message}`);
    }
    
    // 3. Check if ffmpeg is installed and working
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      results.ffmpeg.installed = true;
      results.ffmpeg.version = stdout.split('\n')[0];
      
      // Try a test conversion with a small file
      if (results.directory.exists && results.directory.writable) {
        const testWavPath = path.join(outputPath, `test-${Date.now()}.wav`);
        // Generate a simple silent WAV file
        await execAsync(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 -acodec pcm_s16le ${testWavPath}`);
        
        // Try to convert to MP3
        const testMp3Path = testWavPath.replace('.wav', '.mp3');
        await execAsync(`ffmpeg -i "${testWavPath}" -codec:a libmp3lame -qscale:a 2 "${testMp3Path}" -y`);
        
        // Verify both files exist
        results.ffmpeg.testWavCreated = fs.existsSync(testWavPath);
        results.ffmpeg.testMp3Created = fs.existsSync(testMp3Path);
        
        // Clean up test files
        if (fs.existsSync(testWavPath)) fs.unlinkSync(testWavPath);
        if (fs.existsSync(testMp3Path)) fs.unlinkSync(testMp3Path);
        
        if (!results.ffmpeg.testMp3Created) {
          results.issues.push('ffmpeg MP3 conversion test failed');
        }
      }
    } catch (error) {
      results.ffmpeg.installed = false;
      results.ffmpeg.error = error.message;
      results.issues.push(`ffmpeg error: ${error.message}`);
    }
    
    // 4. Check Swift recorder
    try {
      const recorderPath = './src/swift/Recorder';
      const recorderExists = fs.existsSync(recorderPath);
      results.recorder = {
        exists: recorderExists
      };
      
      if (recorderExists) {
        // Check if it's executable
        try {
          const { stdout } = await execAsync(`ls -la ${recorderPath}`);
          results.recorder.permissions = stdout.trim();
          
          // Check if it has execute permissions
          const hasExecute = stdout.includes('x');
          if (!hasExecute) {
            results.issues.push('Swift recorder file exists but may not have execute permissions');
            // Try to fix permissions
            await execAsync(`chmod +x ${recorderPath}`);
            results.recorder.permissionFixed = true;
          }
        } catch (error) {
          results.recorder.permissionError = error.message;
          results.issues.push(`Error checking recorder permissions: ${error.message}`);
        }
      } else {
        results.issues.push('Swift recorder file is missing');
      }
    } catch (error) {
      results.recorder = { error: error.message };
      results.issues.push(`Error checking recorder: ${error.message}`);
    }
    
    // 5. Summary of findings
    if (results.issues.length === 0) {
      results.summary = 'No issues found. Environment appears correctly set up.';
    } else {
      results.summary = `Found ${results.issues.length} potential issues that could be affecting recording.`;
    }
    
    // Display results
    console.log('Diagnostic Results:', JSON.stringify(results, null, 2));
    
    return results;
  } catch (error) {
    console.error('Error running diagnostics:', error);
    return {
      error: error.message,
      issues: ['Failed to complete diagnostics']
    };
  }
}

/**
 * Show diagnostic results in a dialog
 */
async function showDiagnosticResults(results) {
  if (!results) return;
  
  let message = results.summary || 'Diagnostic results';
  let detail = '';
  
  if (results.issues && results.issues.length > 0) {
    detail += '---- ISSUES FOUND ----\n';
    results.issues.forEach((issue, index) => {
      detail += `${index + 1}. ${issue}\n`;
    });
    detail += '\n';
  }
  
  detail += '---- SYSTEM INFO ----\n';
  if (results.system) {
    Object.entries(results.system).forEach(([key, value]) => {
      detail += `${key}: ${value}\n`;
    });
  }
  
  detail += '\n---- DIRECTORY INFO ----\n';
  if (results.directory) {
    detail += `Directory exists: ${results.directory.exists}\n`;
    detail += `Directory writable: ${results.directory.writable}\n`;
    detail += `FLAC files: ${results.directory.flacCount || 0}\n`;
    detail += `MP3 files: ${results.directory.mp3Count || 0}\n`;
    
    if (results.directory.error) {
      detail += `Directory error: ${results.directory.error}\n`;
    }
  }
  
  detail += '\n---- FFMPEG INFO ----\n';
  if (results.ffmpeg) {
    detail += `ffmpeg installed: ${results.ffmpeg.installed}\n`;
    if (results.ffmpeg.version) {
      detail += `ffmpeg version: ${results.ffmpeg.version}\n`;
    }
    if (results.ffmpeg.error) {
      detail += `ffmpeg error: ${results.ffmpeg.error}\n`;
    }
    
    detail += `Test WAV creation: ${results.ffmpeg.testWavCreated ? 'Success' : 'Failed'}\n`;
    detail += `Test MP3 conversion: ${results.ffmpeg.testMp3Created ? 'Success' : 'Failed'}\n`;
  }
  
  detail += '\n---- RECORDER INFO ----\n';
  if (results.recorder) {
    detail += `Recorder exists: ${results.recorder.exists}\n`;
    if (results.recorder.permissions) {
      detail += `Permissions: ${results.recorder.permissions}\n`;
    }
    if (results.recorder.permissionFixed) {
      detail += `Permissions fixed: Yes\n`;
    }
    if (results.recorder.error) {
      detail += `Recorder error: ${results.recorder.error}\n`;
    }
  }
  
  await dialog.showMessageBox({
    type: results.issues.length > 0 ? 'warning' : 'info',
    title: 'Recording Diagnostics',
    message: message,
    detail: detail,
    buttons: ['OK']
  });
}

/**
 * Fix common issues automatically
 */
async function fixCommonIssues(outputPath) {
  const fixes = [];
  
  try {
    // 1. Ensure output directory exists
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
      fixes.push(`Created output directory: ${outputPath}`);
    }
    
    // 2. Ensure Swift recorder has execute permissions
    const recorderPath = './src/swift/Recorder';
    if (fs.existsSync(recorderPath)) {
      await execAsync(`chmod +x ${recorderPath}`);
      fixes.push('Set execute permissions on Swift recorder');
    } else {
      fixes.push('WARNING: Swift recorder file is missing');
    }
    
    // 3. Try to convert any existing FLAC files to MP3
    const files = fs.readdirSync(outputPath);
    const flacFiles = files.filter(file => file.toLowerCase().endsWith('.flac'));
    
    if (flacFiles.length > 0) {
      for (const flacFile of flacFiles) {
        const flacPath = path.join(outputPath, flacFile);
        const mp3Path = flacPath.replace('.flac', '.mp3');
        
        try {
          // Only convert if MP3 doesn't exist
          if (!fs.existsSync(mp3Path)) {
            await execAsync(`ffmpeg -i "${flacPath}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}" -y`);
            fixes.push(`Converted ${flacFile} to MP3`);
          }
        } catch (error) {
          fixes.push(`Failed to convert ${flacFile}: ${error.message}`);
        }
      }
    }
    
    return fixes;
  } catch (error) {
    console.error('Error fixing issues:', error);
    return [`Error fixing issues: ${error.message}`];
  }
}

module.exports = {
  runRecordingDiagnostics,
  showDiagnosticResults,
  fixCommonIssues
}; 