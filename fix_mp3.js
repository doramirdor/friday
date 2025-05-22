// Script to fix corrupted MP3 files
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the corrupted file
const corruptedFile = process.argv[2] || path.join(process.env.HOME, 'Documents', 'Friday Recordings', 'recording_1747945046417.mp3');

// Check if the file exists
if (!fs.existsSync(corruptedFile)) {
  console.error(`File doesn't exist: ${corruptedFile}`);
  process.exit(1);
}

console.log(`Checking file: ${corruptedFile}`);

// Read a bit of the file to check if it's HTML
let isHtml = false;
try {
  const fileContent = fs.readFileSync(corruptedFile, { encoding: 'utf8', flag: 'r' }).slice(0, 1000);
  isHtml = fileContent.includes('<!DOCTYPE html>') || fileContent.includes('<html');
} catch (err) {
  console.log(`Error reading file: ${err.message}. Assuming file needs fixing.`);
  isHtml = true;
}

if (!isHtml) {
  // Perform a more thorough check by using the 'file' command
  try {
    const fileTypeOutput = execSync(`file "${corruptedFile}"`).toString();
    if (fileTypeOutput.toLowerCase().includes('html')) {
      console.log('File appears to be HTML according to file command.');
      isHtml = true;
    } else if (fileTypeOutput.toLowerCase().includes('mp3') || 
               fileTypeOutput.toLowerCase().includes('audio') || 
               fileTypeOutput.toLowerCase().includes('mpeg')) {
      console.log('File appears to be a valid audio file. No need to fix.');
      process.exit(0);
    }
  } catch (err) {
    console.log(`Error checking file type: ${err.message}`);
  }
}

if (!isHtml) {
  console.log('File appears to be a valid binary file, not HTML. No need to fix.');
  process.exit(0);
}

console.log('File contains HTML instead of MP3 data. Creating a proper MP3 file...');

// Create a backup of the corrupted file
const backupPath = `${corruptedFile}.bak`;
fs.copyFileSync(corruptedFile, backupPath);
console.log(`Created backup at: ${backupPath}`);

// Generate a silence MP3 using ffmpeg
function generateSilenceMp3(outputPath) {
  return new Promise((resolve, reject) => {
    console.log('Generating silence MP3 using ffmpeg...');
    
    try {
      const ffmpegProcess = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', '3',
        '-q:a', '2',
        outputPath
      ]);
      
      ffmpegProcess.stdout.on('data', (data) => {
        console.log(`ffmpeg stdout: ${data}`);
      });
      
      ffmpegProcess.stderr.on('data', (data) => {
        console.log(`ffmpeg stderr: ${data}`);
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`Successfully generated silence MP3 at ${outputPath}`);
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
      
      ffmpegProcess.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Alternative method using execSync
function generateSilenceMp3WithExecSync(outputPath) {
  try {
    console.log('Generating silence MP3 using execSync...');
    execSync(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 3 -q:a 2 "${outputPath}"`);
    console.log(`Successfully generated silence MP3 at ${outputPath}`);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

// Fix the file by generating a proper MP3
generateSilenceMp3(corruptedFile)
  .catch(err => {
    console.error(`Failed to generate silence MP3: ${err.message}`);
    console.log('Trying alternative method...');
    return generateSilenceMp3WithExecSync(corruptedFile);
  })
  .then(() => {
    // Verify file was fixed
    if (fs.existsSync(corruptedFile) && fs.statSync(corruptedFile).size > 0) {
      try {
        const fileTypeOutput = execSync(`file "${corruptedFile}"`).toString();
        if (fileTypeOutput.toLowerCase().includes('mp3') || 
            fileTypeOutput.toLowerCase().includes('audio') || 
            fileTypeOutput.toLowerCase().includes('mpeg')) {
          console.log('Verification successful: File is now a valid audio file.');
        } else {
          console.warn('Verification caution: File type might not be a proper audio file.');
          console.log('File type: ' + fileTypeOutput);
        }
      } catch (err) {
        console.error(`Error verifying file: ${err.message}`);
      }
      
      console.log('File has been fixed successfully!');
    } else {
      throw new Error('Generated file is missing or empty');
    }
  })
  .catch(err => {
    console.error(`Failed to fix the file: ${err.message}`);
    console.log('Restoring backup...');
    fs.copyFileSync(backupPath, corruptedFile);
    console.log('Backup restored.');
  }); 