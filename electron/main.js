const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const axios = require('axios');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key && value) {
          process.env[key] = value;
        }
      }
    });
    console.log('Loaded environment variables from .env.local');
  } catch (err) {
    console.error('Error loading .env.local file:', err);
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (process.platform === 'win32') {
  app.setAppUserModelId('com.friday.app');
}

let mainWindow;

// Import fluent-ffmpeg if it's available, otherwise use null
let ffmpeg = null;
try {
  ffmpeg = require('fluent-ffmpeg');
  console.log('✅ fluent-ffmpeg module loaded successfully');
} catch (e) {
  console.log('ℹ️ fluent-ffmpeg module not available, will use raw ffmpeg commands');
}

// Replace with your actual API key
// IMPORTANT: Store this in environment variables or a secure config in production
const API_KEY = process.env.GOOGLE_SPEECH_API_KEY || 'YOUR_API_KEY';

// Handle the Google Speech-to-Text API calls
async function handleGoogleSpeechAPI(audioBuffer, options = {}) {
  console.log('🔄 main.js: Handling Google Speech API request', {
    audioBufferLength: audioBuffer?.length || audioBuffer?.byteLength || 'undefined',
    options: JSON.stringify(options)
  });
  
  try {
    // Dynamically import Google Speech API to avoid issues with ESM/CJS compatibility
    const speech = require('@google-cloud/speech');
    
    // Configure speech options - use 16000 Hz for best results with Google Speech
    const sampleRateHertz = options.sampleRateHertz || 16000;
    const languageCode = options.languageCode || 'en-US';
    const encoding = options.encoding || 'LINEAR16';
    const audioChannelCount = options.audioChannelCount || 1;
    
    console.log('🔧 main.js: Speech configuration', {
      sampleRateHertz,
      languageCode,
      encoding,
      audioChannelCount
    });
    
    // Debug input audio format
    const inputBufferArray = new Uint8Array(audioBuffer);
    const bufferHeader = Array.from(inputBufferArray.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log('🔍 main.js: Audio buffer header bytes:', bufferHeader);
    
    // Critical fix: For WebM with PCM codec, we need to extract the PCM data
    // WebM magic bytes: 1A 45 DF A3
    const isWebM = bufferHeader.includes('1a 45 df a3');
    let processedBuffer = audioBuffer;
    let finalEncoding = encoding;
    
    if (isWebM) {
      console.log('⚠️ main.js: Detected WebM format audio');
      
      // Explicitly set to OGG_OPUS for all WebM content unless LINEAR16 is forced
      if (!options.forceLinear16) {
        console.log('🔄 main.js: Using OGG_OPUS encoding for WebM audio');
        finalEncoding = 'OGG_OPUS';
      } else {
        console.log('⚠️ main.js: ForceLinear16 set - attempting to treat WebM as LINEAR16');
        finalEncoding = 'LINEAR16';
      }
    }
    
    // First check for API key in environment variable
    const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
    
    let client;
    
    if (apiKey) {
      // Use API key authentication if available
      client = new speech.SpeechClient({
        credentials: {
          client_email: undefined,
          private_key: undefined
        },
        projectId: process.env.GOOGLE_PROJECT_ID || '',
        apiEndpoint: 'speech.googleapis.com',
        auth: {
          apiKey: apiKey
        }
      });
      console.log('🔑 main.js: Using API key authentication for Google Speech');
    } else {
      // Fall back to service account credentials file
      try {
        const credentialsPath = path.join(__dirname, 'google-credentials.json');
        
        // Check if credentials file exists and has been populated
        if (!fs.existsSync(credentialsPath)) {
          console.error('❌ main.js: Credentials file not found at:', credentialsPath);
          throw new Error('Credentials file not found');
        }
        
        const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
        if (credentialsContent.includes('YOUR_PROJECT_ID')) {
          console.error('❌ main.js: Credentials file contains placeholder values');
          throw new Error('Credentials file contains placeholder values');
        }
        
        console.log('📄 main.js: Using credentials file at:', credentialsPath);
        client = new speech.SpeechClient({
          keyFilename: credentialsPath,
        });
        console.log('🔑 main.js: Using service account credentials for Google Speech');
      } catch (credErr) {
        console.error('❌ main.js: Error loading credentials file:', credErr);
        throw new Error('No valid Google Speech authentication method found. Please provide either an API key or a credentials file.');
      }
    }
    
    // Boost audio levels for better speech detection (simple gain)
    if (options.boostAudio && finalEncoding === 'LINEAR16') {
      try {
        console.log('🔊 main.js: Boosting audio levels');
        // Only works for LINEAR16 format (16-bit PCM)
        const view = new Int16Array(processedBuffer);
        const gain = 1.5; // 50% volume boost
        
        for (let i = 0; i < view.length; i++) {
          // Apply gain with clipping protection
          view[i] = Math.max(-32768, Math.min(32767, Math.round(view[i] * gain)));
        }
        
        console.log('✅ main.js: Audio levels boosted');
      } catch (err) {
        console.error('❌ main.js: Error boosting audio levels:', err);
      }
    }
    
    const config = {
      encoding: finalEncoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      audioChannelCount: audioChannelCount,
      enableAutomaticPunctuation: true,
      // Use command and search model for better accuracy with short phrases
      model: options.model || 'command_and_search',
      useEnhanced: true
    };
    
    // Convert audio buffer to base64
    const audioContent = Buffer.from(processedBuffer).toString('base64');
    console.log('🔄 main.js: Converted audio to base64', {
      originalLength: processedBuffer.byteLength,
      base64Length: audioContent.length
    });
    
    const audio = {
      content: audioContent,
    };
    
    const request = {
      config: config,
      audio: audio,
    };
    
    console.log('🚀 main.js: Sending audio to Google Speech API with encoding:', finalEncoding);
    const [response] = await client.recognize(request);
    
    console.log('📥 main.js: Received response from Google Speech API:', {
      responseExists: !!response,
      resultsLength: response?.results?.length || 0
    });
    
    if (!response || !response.results || response.results.length === 0) {
      console.log('⚠️ main.js: No transcription results returned');
      return 'No speech detected';
    }
    
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
      
    console.log('🎯 main.js: Transcription received:', transcription.substring(0, 50) + '...');
    return transcription;
  } catch (error) {
    console.error('❌ main.js: Error with speech recognition:', error);
    
    // Attempt to extract more detailed error information
    const errorDetails = {
      code: error.code,
      status: error.status,
      details: error.details,
      message: error.message
    };
    
    console.error('❌ main.js: Error details:', JSON.stringify(errorDetails, null, 2));
    
    // Provide more specific error messages for common issues
    if (error.message && error.message.includes('API key')) {
      const errorMsg = "Error: Invalid Google API key. Please check your authentication settings.";
      console.error(errorMsg);
      return errorMsg;
    } else if (error.message && error.message.includes('credentials')) {
      const errorMsg = "Error: Google credentials file is missing or invalid. Please set up authentication.";
      console.error(errorMsg);
      return errorMsg;
    } else if (error.code === 3 || (error.message && error.message.includes('format'))) {
      // Google Speech API returns code 3 for invalid argument (often audio format issues)
      const errorMsg = "Error: Audio format not supported. Try changing the encoding in settings.";
      console.error(errorMsg);
      return errorMsg;
    } else if (error.code === 7) {
      // Permission denied
      const errorMsg = "Error: Permission denied. Check your Google Cloud Speech permissions.";
      console.error(errorMsg);
      return errorMsg;
    } else if (error.code === 16) {
      // Unauthenticated
      const errorMsg = "Error: Authentication failed. Check your Google Cloud credentials.";
      console.error(errorMsg);
      return errorMsg;
    } else {
      const errorMsg = `Sorry, there was an error transcribing the audio: ${error.message || 'Unknown error'}`;
      console.error(errorMsg);
      return errorMsg;
    }
  }
}

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fff'
  });

  // In development, use the Vite dev server with retry logic
  if (process.env.NODE_ENV !== 'production') {
    const loadURL = async (attempt = 1, maxAttempts = 5) => {
      try {
        await mainWindow.loadURL('http://localhost:8082');
        console.log('Successfully connected to Vite dev server');
        mainWindow.webContents.openDevTools();
      } catch (error) {
        if (attempt < maxAttempts) {
          console.log(`Attempt ${attempt} failed, retrying in 1 second...`);
          setTimeout(() => loadURL(attempt + 1, maxAttempts), 1000);
        } else {
          console.error('Failed to connect to Vite dev server after multiple attempts:', error);
        }
      }
    };
    
    await loadURL();
  } else {
    // In production, load the built files
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open external links in the default browser, not in the Electron app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

// IPC handler example
ipcMain.on('to-main', (event, args) => {
  console.log('Message received in main process:', args);
  // You can send a response back
  event.reply('from-main', 'Message received in main process');
});

// Handle the Google Speech transcription requests
ipcMain.handle('invoke-google-speech', async (event, audioBuffer, options = {}) => {
  return await handleGoogleSpeechAPI(audioBuffer, options);
});

// Allow selecting a credentials file
ipcMain.handle('select-credentials-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
    title: 'Select Google Cloud Service Account Key File'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    try {
      const fileContent = fs.readFileSync(selectedPath, 'utf8');
      fs.writeFileSync(path.join(__dirname, 'google-credentials.json'), fileContent);
      return { success: true };
    } catch (error) {
      console.error('Error copying credentials file:', error);
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, canceled: true };
});

// Handle existing audio file transcription test
ipcMain.handle('test-speech-with-file', async (event, filePath) => {
  try {
    console.log('🧪 Testing speech recognition with audio file:', filePath);

    // Handle relative paths - convert them to absolute
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      // If path is relative, resolve from the app's root directory
      resolvedPath = path.resolve(app.getAppPath(), filePath);
      console.log(`📍 Resolved relative path to: ${resolvedPath}`);
    }

    // Check if the file exists - if not, try appending common extensions
    if (!fs.existsSync(resolvedPath)) {
      console.log(`⚠️ File not found: ${resolvedPath}, trying to add extensions...`);
      
      // Try common audio extensions
      const commonExtensions = ['.mp3', '.wav', '.ogg', '.flac'];
      let fileFound = false;
      
      for (const ext of commonExtensions) {
        const pathWithExt = resolvedPath + ext;
        if (fs.existsSync(pathWithExt)) {
          console.log(`✅ Found file with extension: ${pathWithExt}`);
          resolvedPath = pathWithExt;
          fileFound = true;
          break;
        }
      }
      
      if (!fileFound) {
        // Also try Friday Recordings directory
        const recordingsDir = path.join(app.getPath('documents'), 'Friday Recordings');
        const filename = path.basename(resolvedPath);
        
        console.log(`🔍 Looking for ${filename} in ${recordingsDir}...`);
        
        // Check if file exists in recordings directory
        const recordingPath = path.join(recordingsDir, filename);
        if (fs.existsSync(recordingPath)) {
          console.log(`✅ Found file in recordings directory: ${recordingPath}`);
          resolvedPath = recordingPath;
          fileFound = true;
        } else {
          // Try with extensions in recordings directory
          for (const ext of commonExtensions) {
            const pathWithExt = recordingPath + ext;
            if (fs.existsSync(pathWithExt)) {
              console.log(`✅ Found file with extension in recordings directory: ${pathWithExt}`);
              resolvedPath = pathWithExt;
              fileFound = true;
              break;
            }
          }
        }
      }
      
      if (!fileFound) {
        console.error(`❌ Audio file does not exist: ${resolvedPath}`);
        return { error: `File not found: ${filePath}` };
      }
    }

    // Read the file
    let audioBuffer;
    try {
      audioBuffer = fs.readFileSync(resolvedPath);
      console.log(`✅ Successfully read audio file: ${resolvedPath}, size: ${audioBuffer.length} bytes`);
    } catch (error) {
      console.error(`❌ Error reading audio file: ${resolvedPath}`, error);
      return { error: `Failed to read audio file: ${error.message}` };
    }

    // Determine encoding based on file extension
    const fileExt = path.extname(resolvedPath).toLowerCase();
    let encoding = 'LINEAR16'; // Default for WAV

    if (fileExt === '.mp3') {
      encoding = 'MP3';
      console.log('🎵 Detected MP3 format, using MP3 encoding');
    } else if (fileExt === '.ogg') {
      encoding = 'OGG_OPUS';
      console.log('🎵 Detected OGG format, using OGG_OPUS encoding');
    } else if (fileExt === '.wav') {
      encoding = 'LINEAR16';
      console.log('🎵 Detected WAV format, using LINEAR16 encoding');
    } else {
      // If no extension or unknown extension, try to detect format from file header
      if (audioBuffer && audioBuffer.length > 4) {
        // Check for MP3 signature
        if (audioBuffer[0] === 0x49 && audioBuffer[1] === 0x44 && audioBuffer[2] === 0x33 || 
            (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)) {
          console.log('🎵 Detected MP3 header signature, using MP3 encoding');
          encoding = 'MP3';
        }
        // Check for WAV signature (RIFF)
        else if (audioBuffer[0] === 0x52 && audioBuffer[1] === 0x49 && audioBuffer[2] === 0x46 && audioBuffer[3] === 0x46) {
          console.log('🎵 Detected WAV/RIFF header signature, using LINEAR16 encoding');
          encoding = 'LINEAR16';
        }
        // Check for OGG signature ("OggS")
        else if (audioBuffer[0] === 0x4F && audioBuffer[1] === 0x67 && audioBuffer[2] === 0x67 && audioBuffer[3] === 0x53) {
          console.log('🎵 Detected OGG header signature, using OGG_OPUS encoding');
          encoding = 'OGG_OPUS';
        }
        else {
          console.log(`⚠️ Unknown file format, defaulting to LINEAR16 encoding`);
        }
      }
    }

    // Call the existing function to process the audio
    const transcription = await handleGoogleSpeechAPI(audioBuffer, {
      encoding,
      // Use defaults for other options
      sampleRateHertz: 16000,
      languageCode: 'en-US'
    });

    console.log('📝 Transcription result:', transcription);
    return transcription;
  } catch (error) {
    console.error('❌ Error testing speech with file:', error);
    return `Error: ${error.message || 'Unknown error'}`;
  }
});

// Handle saving audio files to disk in multiple formats
ipcMain.handle('save-audio-file', async (event, { buffer, filename, formats = ['wav', 'mp3'] }) => {
  try {
    // Create recordings directory if it doesn't exist
    const recordingsDir = path.join(app.getPath('documents'), 'Friday Recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    // Create a timestamp-based filename if none provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Ensure we're working with a clean filename without extension
    let baseFilename = filename || `recording-${timestamp}`;
    // Remove any existing extension
    baseFilename = baseFilename.replace(/\.\w+$/, '');
    
    console.log(`🔖 Using base filename: ${baseFilename}`);
    
    // First save the raw WAV file
    const wavFilePath = path.join(recordingsDir, `${baseFilename}.wav`);
    fs.writeFileSync(wavFilePath, Buffer.from(buffer));
    console.log(`✅ WAV file saved to: ${wavFilePath}`);
    
    const savedFiles = [{ format: 'wav', path: wavFilePath }];
    
    // If MP3 is requested, convert the WAV to MP3 using ffmpeg
    if (formats.includes('mp3')) {
      try {
        const mp3FilePath = path.join(recordingsDir, `${baseFilename}.mp3`);
        
        // Check if ffmpeg is installed
        try {
          await execPromise('ffmpeg -version');
        } catch (err) {
          console.warn('⚠️ ffmpeg not found, MP3 conversion skipped');
          return {
            success: true,
            files: savedFiles,
            message: 'WAV file saved, MP3 conversion skipped (ffmpeg not found)'
          };
        }
        
        // Function to attempt MP3 conversion using multiple methods
        const convertToMP3 = async () => {
          // Try the primary conversion method first
          try {
            // Convert WAV to MP3 using ffmpeg with optimized parameters
            console.log(`🔄 Converting to MP3: ${mp3FilePath}`);
            await execPromise(`ffmpeg -y -i "${wavFilePath}" -codec:a libmp3lame -qscale:a 2 -map_metadata 0 -id3v2_version 3 "${mp3FilePath}"`);
            
            if (fs.existsSync(mp3FilePath)) {
              // Verify the file is actually an MP3 by checking the file signature
              const fileHeader = fs.readFileSync(mp3FilePath, { length: 4 });
              
              // MP3 files typically start with ID3 (0x49 0x44 0x33) or with an MP3 frame header
              const isMP3 = fileHeader[0] === 0x49 && fileHeader[1] === 0x44 && fileHeader[2] === 0x33 || 
                           (fileHeader[0] === 0xFF && (fileHeader[1] & 0xE0) === 0xE0);
              
              if (isMP3) {
                console.log(`✅ MP3 file saved and verified to: ${mp3FilePath}`);
                return true;
              }
            }
            return false;
          } catch (err) {
            console.error('❌ Primary MP3 conversion method failed:', err);
            return false;
          }
        };
        
        // Try using the main conversion method
        let conversionSuccess = await convertToMP3();
        
        // If the primary method failed and fluent-ffmpeg is available, try that
        if (!conversionSuccess && ffmpeg) {
          try {
            console.log('🔄 Trying MP3 conversion with fluent-ffmpeg...');
            
            // Return a promise for fluent-ffmpeg conversion
            await new Promise((resolve, reject) => {
              ffmpeg(wavFilePath)
                .audioCodec('libmp3lame')
                .audioBitrate(320)
                .audioChannels(2)
                .format('mp3')
                .output(mp3FilePath)
                .on('end', () => {
                  console.log('✅ MP3 conversion completed with fluent-ffmpeg');
                  resolve();
                })
                .on('error', (err) => {
                  console.error('❌ fluent-ffmpeg conversion failed:', err);
                  reject(err);
                })
                .run();
            });
            
            if (fs.existsSync(mp3FilePath)) {
              console.log(`✅ MP3 file saved with fluent-ffmpeg: ${mp3FilePath}`);
              conversionSuccess = true;
            }
          } catch (fluentErr) {
            console.error('❌ fluent-ffmpeg MP3 conversion failed:', fluentErr);
          }
        }
        
        // If none of the conversion methods worked, try one last method with high bitrate
        if (!conversionSuccess) {
          try {
            console.log('🔄 Trying final MP3 conversion method...');
            await execPromise(`ffmpeg -y -i "${wavFilePath}" -codec:a libmp3lame -b:a 320k "${mp3FilePath}"`);
            
            if (fs.existsSync(mp3FilePath)) {
              console.log(`✅ MP3 file saved with last resort method: ${mp3FilePath}`);
              conversionSuccess = true;
            }
          } catch (lastErr) {
            console.error('❌ Last resort MP3 conversion failed:', lastErr);
          }
        }
        
        // If any conversion method succeeded, add the MP3 to saved files
        if (conversionSuccess) {
          savedFiles.push({ format: 'mp3', path: mp3FilePath });
        } else {
          console.error('❌ All MP3 conversion methods failed');
        }
      } catch (convErr) {
        console.error('❌ Error converting to MP3:', convErr);
      }
    }
    
    // Return all the saved file paths
    return {
      success: true,
      files: savedFiles,
      primaryFilePath: wavFilePath, // For backward compatibility
      filePath: wavFilePath, // For backward compatibility
      message: `Files saved: ${savedFiles.map(f => f.format).join(', ')}`
    };
  } catch (error) {
    console.error('❌ Error saving audio file:', error);
    return {
      success: false,
      message: `Failed to save file: ${error.message}`
    };
  }
});

app.whenReady().then(() => {
  // Set NODE_ENV to development if not set
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
  }
  
  // Check Google Speech credentials on startup
  const checkGoogleCredentials = () => {
    console.log('🔍 Checking Google Speech credentials on startup');
    
    // Check if @google-cloud/speech is installed
    let speech;
    try {
      speech = require('@google-cloud/speech');
      const speechVersion = require('@google-cloud/speech/package.json').version;
      console.log('✅ @google-cloud/speech library found, version:', speechVersion);
    } catch (error) {
      console.error('❌ @google-cloud/speech library not found or cannot be loaded:', error.message);
      console.error('Please run: npm install @google-cloud/speech');
      return false;
    }
    
    // Check for API key in environment
    const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
    if (apiKey) {
      console.log('✅ Found Google Speech API key in environment variables');
      
      // Test creating client with API key
      try {
        const client = new speech.SpeechClient({
          credentials: {
            client_email: undefined,
            private_key: undefined
          },
          projectId: process.env.GOOGLE_PROJECT_ID || '',
          apiEndpoint: 'speech.googleapis.com',
          auth: {
            apiKey: apiKey
          }
        });
        console.log('✅ Successfully created Speech client with API key');
        
        // Run a test recognition to verify API access
        testGoogleSpeechAPI(client).then(success => {
          if (success) {
            console.log('✅ Google Speech API test successful!');
          } else {
            console.error('❌ Google Speech API test failed!');
          }
        });
        
        return true;
      } catch (error) {
        console.error('❌ Failed to create Speech client with API key:', error);
      }
    }
    
    // Check for credentials file
    const credentialsPath = path.join(__dirname, 'google-credentials.json');
    if (!fs.existsSync(credentialsPath)) {
      console.error('❌ Google credentials file not found at:', credentialsPath);
      return false;
    }
    
    try {
      const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
      const credentials = JSON.parse(credentialsContent);
      
      if (credentials.project_id === 'YOUR_PROJECT_ID' || 
          credentials.private_key === 'YOUR_PRIVATE_KEY') {
        console.error('❌ Google credentials file contains placeholder values. Please update with real credentials.');
        
        // Display current values in credentials file
        console.log('📄 Current Google credentials file content:', credentials);
        return false;
      }
      
      console.log('✅ Google credentials file found and appears to be valid');
      console.log('📊 Project ID:', credentials.project_id);
      
      // Test creating client with credentials file
      try {
        const client = new speech.SpeechClient({
          keyFilename: credentialsPath,
        });
        console.log('✅ Successfully created Speech client with credentials file');
        
        // Run a test recognition to verify API access
        testGoogleSpeechAPI(client).then(success => {
          if (success) {
            console.log('✅ Google Speech API test successful!');
          } else {
            console.error('❌ Google Speech API test failed!');
          }
        });
        
        return true;
      } catch (error) {
        console.error('❌ Failed to create Speech client with credentials file:', error);
        return false;
      }
    } catch (error) {
      console.error('❌ Error reading Google credentials file:', error);
      return false;
    }
  };
  
  checkGoogleCredentials();
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Test function to verify Google Speech API works with a minimal example
async function testGoogleSpeechAPI(client) {
  try {
    console.log('🔍 Testing Google Speech API with sample audio...');
    
    // Create a simple sine wave audio buffer (440Hz tone)
    const sampleRate = 16000;
    const durationSecs = 2;
    const numSamples = sampleRate * durationSecs;
    const buffer = Buffer.alloc(numSamples * 2); // 16-bit samples = 2 bytes per sample
    
    // Generate a simple sine wave
    for (let i = 0; i < numSamples; i++) {
      // Simple sine wave at 440Hz
      const sample = Math.sin(440 * Math.PI * 2 * i / sampleRate) * 0x7FFF;
      buffer.writeInt16LE(sample, i * 2);
    }
    
    console.log('🔊 Created test audio buffer:', {
      sampleRate,
      durationSecs,
      bufferSize: buffer.length
    });
    
    // Convert buffer to base64
    const audioContent = buffer.toString('base64');
    
    // Set up recognition config (simple LINEAR16 format)
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: sampleRate,
      languageCode: 'en-US',
      audioChannelCount: 1,
    };
    
    const audio = {
      content: audioContent,
    };
    
    const request = {
      config: config,
      audio: audio,
    };
    
    console.log('🚀 Sending test audio to Google Speech API...');
    
    const [response] = await client.recognize(request);
    
    console.log('📥 Received response from Google Speech API test:', {
      responseExists: !!response,
      resultsCount: response?.results?.length || 0
    });
    
    // We don't expect actual speech recognition from a sine wave,
    // but we do expect a successful API call without errors
    return true;
  } catch (error) {
    console.error('❌ Google Speech API test failed with error:', error);
    return false;
  }
}

// Handle audio transcription requests
ipcMain.handle('transcribe-audio', async (event, buffer) => {
  try {
    console.log('📥 Received audio buffer of size:', buffer.length);
    const base64Audio = Buffer.from(buffer).toString('base64');

    // Get the API key from environment variables
    const API_KEY = process.env.GOOGLE_SPEECH_API_KEY;
    if (!API_KEY) {
      console.error('❌ GOOGLE_SPEECH_API_KEY environment variable is not set');
      return { 
        success: false, 
        error: 'API key is not configured. Please set the GOOGLE_SPEECH_API_KEY environment variable.'
      };
    }

    // Examine the first few bytes to determine if it's an MP3 file
    let encoding = 'WEBM_OPUS'; // Default 
    let sampleRateHertz = 48000; // Default

    // Check for MP3 signature (ID3v2 or MP3 frame header)
    if (buffer.length > 4) {
      // Check for ID3 header
      if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
        console.log('🎵 Detected ID3 header, using MP3 encoding');
        encoding = 'MP3';
        sampleRateHertz = 44100;
      } 
      // Check for MP3 frame sync (first 11 bits set to 1)
      else if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
        console.log('🎵 Detected MP3 frame header, using MP3 encoding');
        encoding = 'MP3';
        sampleRateHertz = 44100;
      }
      // Check for WAV header
      else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        console.log('🎵 Detected WAV/RIFF header, using LINEAR16 encoding');
        encoding = 'LINEAR16';
        sampleRateHertz = 16000;
      }
    }

    console.log(`🔍 Using encoding: ${encoding}, sample rate: ${sampleRateHertz}Hz`);

    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${API_KEY}`,
      {
        config: {
          encoding: encoding,
          sampleRateHertz: sampleRateHertz,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'default'
        },
        audio: {
          content: base64Audio
        }
      }
    );

    if (!response.data.results || response.data.results.length === 0) {
      console.log('⚠️ No transcription results returned');
      return { success: false, error: 'No speech detected' };
    }

    const transcript = response.data.results
      .map(r => r.alternatives[0].transcript)
      .join('\n');
    
    console.log('✅ Transcription successful:', transcript.substring(0, 100) + (transcript.length > 100 ? '...' : ''));
    return { success: true, transcript };
  } catch (err) {
    console.error('❌ Error transcribing audio:', err.response?.data || err.message);
    return { 
      success: false, 
      error: err.response?.data?.error?.message || err.message || 'Unknown error' 
    };
  }
}); 