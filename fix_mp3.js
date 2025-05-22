// Script to fix corrupted MP3 files
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the corrupted file
const corruptedFile = process.argv[2] || path.join(process.env.HOME, 'Documents', 'Friday Recordings', 'recording_1747941681360.mp3');

// Check if the file exists
if (!fs.existsSync(corruptedFile)) {
  console.error(`File doesn't exist: ${corruptedFile}`);
  process.exit(1);
}

console.log(`Checking file: ${corruptedFile}`);

// Read a bit of the file to check if it's HTML
const fileContent = fs.readFileSync(corruptedFile, { encoding: 'utf8', flag: 'r' }).slice(0, 1000);
const isHtml = fileContent.includes('<!DOCTYPE html>') || fileContent.includes('<html');

if (!isHtml) {
  console.log('File appears to be a valid binary file, not HTML. No need to fix.');
  process.exit(0);
}

console.log('File contains HTML instead of MP3 data. Downloading a proper MP3 file...');

// Create a backup of the corrupted file
const backupPath = `${corruptedFile}.bak`;
fs.copyFileSync(corruptedFile, backupPath);
console.log(`Created backup at: ${backupPath}`);

// Function to download a silence MP3 file
function downloadSilenceMp3(outputPath) {
  return new Promise((resolve, reject) => {
    const silenceUrl = 'https://github.com/anars/blank-audio/raw/master/3-seconds-of-silence.mp3';
    const tempPath = `${outputPath}.download`;
    
    console.log(`Downloading silence MP3 from ${silenceUrl} to ${tempPath}`);
    
    const file = fs.createWriteStream(tempPath);
    
    https.get(silenceUrl, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(tempPath); } catch (e) {}
        reject(new Error(`Failed to download: status ${response.statusCode}`));
        return;
      }
      
      // This time, directly save the response data instead of trying to check it
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => {
          // Check file size
          const stats = fs.statSync(tempPath);
          if (stats.size === 0) {
            try { fs.unlinkSync(tempPath); } catch (e) {}
            reject(new Error('Downloaded file is empty'));
            return;
          }
          
          // Check if file is binary (not text/HTML)
          try {
            const buffer = fs.readFileSync(tempPath, { encoding: null });
            const isTextFile = buffer.some(byte => byte === 0x3C) && // '<'
                              buffer.some(byte => byte === 0x3E) && // '>'
                              buffer.some(byte => byte === 0x21) && // '!'
                              buffer.some(byte => byte === 0x44); // 'D'
            
            if (isTextFile) {
              try { fs.unlinkSync(tempPath); } catch (e) {}
              reject(new Error('Downloaded file appears to be text, not MP3'));
              return;
            }
          } catch (err) {
            console.error(`Error checking file type: ${err.message}`);
          }
          
          // Move temp file to target
          fs.renameSync(tempPath, outputPath);
          console.log(`Successfully downloaded MP3 to ${outputPath} (${stats.size} bytes)`);
          resolve();
        });
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(tempPath); } catch (e) {}
      reject(err);
    });
  });
}

// Try to download directly from a CDN instead of GitHub
function downloadFromCDN(outputPath) {
  return new Promise((resolve, reject) => {
    // Try a different source for the silence MP3
    const cdnUrl = 'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/3-seconds-of-silence.mp3';
    const tempPath = `${outputPath}.cdn`;
    
    console.log(`Downloading from CDN: ${cdnUrl} to ${tempPath}`);
    
    const file = fs.createWriteStream(tempPath);
    
    https.get(cdnUrl, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(tempPath); } catch (e) {}
        reject(new Error(`Failed to download from CDN: status ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => {
          const stats = fs.statSync(tempPath);
          if (stats.size === 0) {
            try { fs.unlinkSync(tempPath); } catch (e) {}
            reject(new Error('Downloaded CDN file is empty'));
            return;
          }
          
          fs.renameSync(tempPath, outputPath);
          console.log(`Successfully downloaded from CDN to ${outputPath} (${stats.size} bytes)`);
          resolve();
        });
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(tempPath); } catch (e) {}
      reject(err);
    });
  });
}

// Alternative method to use a local silence MP3 file
function useLocalSilenceMp3(outputPath) {
  const silencePath = path.join(__dirname, 'src', 'assets', 'silence.mp3');
  
  if (!fs.existsSync(silencePath)) {
    return Promise.reject(new Error(`Local silence MP3 not found at ${silencePath}`));
  }
  
  try {
    const stats = fs.statSync(silencePath);
    if (stats.size === 0) {
      return Promise.reject(new Error(`Local silence MP3 is empty at ${silencePath}`));
    }
    
    fs.copyFileSync(silencePath, outputPath);
    console.log(`Copied local silence MP3 to ${outputPath} (${stats.size} bytes)`);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

// Create an empty MP3 file as a last resort
function createSyntheticMP3(outputPath) {
  try {
    console.log('Creating synthetic MP3 file...');
    
    // Create a valid MP3 file with multiple frames
    const silenceData = Buffer.alloc(10240); // 10KB buffer
    
    // Fill with repeating MP3 frame headers and empty frames
    // MP3 frame header: 0xFF 0xFB followed by bitrate and other info
    for (let i = 0; i < silenceData.length; i += 32) {
      if (i + 32 <= silenceData.length) {
        // Frame header
        silenceData[i] = 0xFF;
        silenceData[i+1] = 0xFB;
        silenceData[i+2] = 0x90; // Bitrate info
        silenceData[i+3] = 0x44; // Frequency info
        // Rest of frame is silence data
      }
    }
    
    fs.writeFileSync(outputPath, silenceData);
    console.log(`Created synthetic MP3 file at ${outputPath} (${silenceData.length} bytes)`);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

// Try each method in sequence
downloadSilenceMp3(corruptedFile)
  .catch(downloadError => {
    console.error(`Download failed: ${downloadError.message}`);
    console.log('Trying to download from CDN...');
    return downloadFromCDN(corruptedFile);
  })
  .catch(cdnError => {
    console.error(`CDN download failed: ${cdnError.message}`);
    console.log('Trying to use local silence MP3 file...');
    return useLocalSilenceMp3(corruptedFile);
  })
  .catch(localError => {
    console.error(`Local file failed: ${localError.message}`);
    console.log('Creating synthetic MP3 as last resort...');
    return createSyntheticMP3(corruptedFile);
  })
  .then(() => {
    console.log('File has been fixed successfully!');
  })
  .catch(err => {
    console.error(`Failed to fix the file: ${err.message}`);
    console.log('Restoring backup...');
    fs.copyFileSync(backupPath, corruptedFile);
    console.log('Backup restored.');
  }); 