const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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

// Handle the Google Speech-to-Text API calls
async function handleGoogleSpeechAPI(audioBuffer, options = {}) {
  console.log('📊 handleGoogleSpeechAPI called with buffer size:', audioBuffer?.length || 0, 'options:', JSON.stringify(options));
  
  try {
    // First check for API key in environment variable
    const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
    
    if (apiKey) {
      // Use direct HTTP request with API key
      console.log("🔑 Using API key authentication for Google Speech");
      const https = require('https');
      const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;
      
      // Configure encoding based on options
      const encoding = options.encoding || 'LINEAR16';
      const sampleRateHertz = options.sampleRateHertz || 48000;
      const languageCode = options.languageCode || 'en-US';
      
      console.log(`📝 Speech config: encoding=${encoding}, sampleRate=${sampleRateHertz}, languageCode=${languageCode}`);
      
      // Prepare request data
      const requestData = JSON.stringify({
        config: {
          encoding: encoding,
          sampleRateHertz: sampleRateHertz,
          languageCode: languageCode,
          enableAutomaticPunctuation: true,
          model: options.model || 'command_and_search',
        },
        audio: {
          content: Buffer.from(audioBuffer).toString('base64')
        }
      });
      
      console.log(`🔍 Request payload size: ${Buffer.byteLength(requestData)} bytes`);
      
      // Make HTTP request to Google Speech API
      const response = await new Promise((resolve, reject) => {
        const req = https.request(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(requestData)
            }
          },
          (res) => {
            console.log(`🌐 Google API response status: ${res.statusCode}`);
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(data);
              } else {
                console.error(`❌ API error response: ${data}`);
                reject(new Error(`HTTP error ${res.statusCode}: ${data}`));
              }
            });
          }
        );
        
        req.on('error', (err) => {
          console.error('❌ Request error:', err);
          reject(err);
        });
        req.write(requestData);
        req.end();
      });
      
      // Parse the response
      const result = JSON.parse(response);
      console.log("🎯 API response:", JSON.stringify(result, null, 2));
      
      if (result.results && result.results.length > 0) {
        const transcription = result.results
          .map(result => result.alternatives[0].transcript)
          .join('\n');
        console.log(`✅ Transcription result: "${transcription}"`);
        return transcription;
      } else {
        console.log('⚠️ No transcription results in response');
        return "No speech detected";
      }
    } else {
      // Fall back to service account credentials file
      console.log("🔑 Using service account authentication for Google Speech");
      const speech = require('@google-cloud/speech');
      
      try {
        const credentialsPath = path.join(__dirname, 'google-credentials.json');
        console.log(`🔍 Looking for credentials at: ${credentialsPath}`);
        console.log(`🔍 Credentials file exists: ${fs.existsSync(credentialsPath)}`);
        
        const client = new speech.SpeechClient({
          keyFilename: credentialsPath,
        });
        
        // Configure encoding based on options
        const encoding = options.encoding || 'LINEAR16';
        const sampleRateHertz = options.sampleRateHertz || 48000;
        const languageCode = options.languageCode || 'en-US';
        
        console.log(`📝 Speech config: encoding=${encoding}, sampleRate=${sampleRateHertz}, languageCode=${languageCode}`);
        
        const config = {
          encoding: encoding,
          sampleRateHertz: sampleRateHertz,
          languageCode: languageCode,
          enableAutomaticPunctuation: true,
          model: options.model || 'command_and_search',
        };
        
        const audio = {
          content: Buffer.from(audioBuffer).toString('base64'),
        };
        
        const request = {
          config: config,
          audio: audio,
        };
        
        console.log('🚀 Sending request to Google Cloud Speech API');
        const [response] = await client.recognize(request);
        console.log('🎯 API response:', JSON.stringify(response, null, 2));
        
        if (!response || !response.results || response.results.length === 0) {
          console.log('⚠️ No transcription results in response');
          return "No speech detected";
        }
        
        const transcription = response.results
          .map(result => result.alternatives[0].transcript)
          .join('\n');
          
        console.log(`✅ Transcription result: "${transcription}"`);
        return transcription;
      } catch (credErr) {
        console.error('❌ Error with service account authentication:', credErr);
        throw new Error('No valid Google Speech authentication method found. Please provide either an API key or a credentials file.');
      }
    }
  } catch (error) {
    console.error('❌ Error with speech recognition:', error);
    // If there's an error, return a fallback message
    return `Error: ${error.message || 'Unknown error with speech recognition'}`;
  }
}

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Allow Node.js modules in preload script
      sandbox: false,
      enableRemoteModule: false,
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
ipcMain.handle('invoke-google-speech', async (event, audioBuffer) => {
  return await handleGoogleSpeechAPI(audioBuffer);
});

// Handle saving audio files to disk
ipcMain.handle('save-audio-file', async (event, { buffer, filename, formats = ['wav'] }) => {
  try {
    // Create recordings directory if it doesn't exist
    const recordingsDir = path.join(app.getPath('documents'), 'Friday Recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    // Create a timestamp-based filename if none provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = filename || `recording-${timestamp}`;
    
    // Remove any file extension from the base filename
    const filenameWithoutExt = baseFilename.replace(/\.\w+$/, '');
    
    // Full path to save the file (without extension)
    const baseFilePath = path.join(recordingsDir, filenameWithoutExt);
    
    console.log(`💾 Saving audio file: ${baseFilePath} with formats:`, formats);
    
    // Create an audio buffer for processing
    const audioData = Buffer.from(buffer);
    
    // Array to store saved files
    const savedFiles = [];
    
    // Always save as WAV first, regardless of requested formats
    const wavFilePath = `${baseFilePath}.wav`;
    fs.writeFileSync(wavFilePath, audioData);
    console.log(`📄 WAV file saved to: ${wavFilePath}`);
    savedFiles.push({ format: 'wav', path: wavFilePath });
    
    // If MP3 is requested, convert the WAV to MP3
    if (formats.includes('mp3')) {
      try {
        // Check if ffmpeg is available
        const mp3FilePath = `${baseFilePath}.mp3`;
        
        // Try conversion with ffmpeg
        try {
          // Simple ffmpeg command
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execPromise = promisify(exec);
          
          console.log(`🔄 Converting ${wavFilePath} to ${mp3FilePath}`);
          await execPromise(`ffmpeg -i "${wavFilePath}" -vn -ar 44100 -ac 2 -b:a 192k "${mp3FilePath}" -y`);
          
          // Verify the MP3 file was created
          if (fs.existsSync(mp3FilePath)) {
            console.log(`✅ MP3 file saved to: ${mp3FilePath}`);
            savedFiles.push({ format: 'mp3', path: mp3FilePath });
          } else {
            console.warn('⚠️ MP3 file was not created');
          }
        } catch (convErr) {
          console.error('❌ Error converting to MP3:', convErr);
        }
      } catch (ffmpegErr) {
        console.error('❌ Error using ffmpeg for MP3 conversion:', ffmpegErr);
      }
    }
    
    // Return success with array of saved files
    return {
      success: true,
      files: savedFiles,
      filePath: baseFilePath, // Legacy support without extension
      primaryFilePath: wavFilePath, // For backward compatibility with extension
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

// Handle testing speech recognition with an existing file
ipcMain.handle('test-speech-with-file', async (event, filePath) => {
  try {
    console.log(`📝 Testing speech recognition with file: ${filePath}`);
    
    // Ensure file has proper extension
    let filePathWithExt = filePath;
    if (!path.extname(filePath)) {
      if (fs.existsSync(`${filePath}.mp3`)) {
        filePathWithExt = `${filePath}.mp3`;
        console.log(`📊 Adding .mp3 extension: ${filePathWithExt}`);
      } else if (fs.existsSync(`${filePath}.wav`)) {
        filePathWithExt = `${filePath}.wav`;
        console.log(`📊 Adding .wav extension: ${filePathWithExt}`);
      }
    }
    
    // Check if the file exists
    const fileExists = fs.existsSync(filePathWithExt);
    console.log(`🔍 File exists (${filePathWithExt}): ${fileExists}`);
    
    if (!fileExists) {
      // Try to list files in directory to see what's available
      try {
        const dirPath = path.dirname(filePathWithExt);
        console.log(`📂 Checking directory: ${dirPath}`);
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath);
          console.log(`📄 Files in directory: ${files.join(', ')}`);
        } else {
          console.log(`❌ Directory doesn't exist: ${dirPath}`);
        }
      } catch (dirErr) {
        console.error(`❌ Error listing directory: ${dirErr.message}`);
      }
      
      console.error(`❌ File not found: ${filePathWithExt}`);
      return {
        error: `File not found: ${filePathWithExt}`
      };
    }
    
    // Read the file contents
    const fileBuffer = fs.readFileSync(filePathWithExt);
    console.log(`📊 Read file: ${filePathWithExt}, size: ${fileBuffer.length} bytes`);
    
    // Get file stats
    const stats = fs.statSync(filePathWithExt);
    console.log(`📊 File stats: size=${stats.size}, created=${stats.birthtime}, modified=${stats.mtime}`);
    
    // Determine encoding based on file extension
    const fileExt = path.extname(filePathWithExt).toLowerCase();
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
      console.log(`⚠️ Unknown file extension: ${fileExt}, checking file signature`);
      
      // Check file signature
      if (fileBuffer.length > 4) {
        // Check for MP3 signature
        if (fileBuffer[0] === 0x49 && fileBuffer[1] === 0x44 && fileBuffer[2] === 0x33 || 
            (fileBuffer[0] === 0xFF && (fileBuffer[1] & 0xE0) === 0xE0)) {
          console.log('🎵 Detected MP3 file signature, using MP3 encoding');
          encoding = 'MP3';
        }
        // Check for WAV signature (RIFF)
        else if (fileBuffer[0] === 0x52 && fileBuffer[1] === 0x49 && fileBuffer[2] === 0x46 && fileBuffer[3] === 0x46) {
          console.log('🎵 Detected WAV/RIFF file signature, using LINEAR16 encoding');
          encoding = 'LINEAR16';
        }
        // Check for OGG signature ("OggS")
        else if (fileBuffer[0] === 0x4F && fileBuffer[1] === 0x67 && fileBuffer[2] === 0x67 && fileBuffer[3] === 0x53) {
          console.log('🎵 Detected OGG file signature, using OGG_OPUS encoding');
          encoding = 'OGG_OPUS';
        }
      }
    }
    
    // Use the existing Google Speech handler
    const transcription = await handleGoogleSpeechAPI(fileBuffer, {
      encoding,
      sampleRateHertz: 16000,
      languageCode: 'en-US',
      model: 'command_and_search'
    });
    console.log(`✅ Transcription result: "${transcription}"`);
    
    return {
      transcription
    };
  } catch (error) {
    console.error(`❌ Error testing speech with file: ${error.message}`);
    return {
      error: `Failed to test speech: ${error.message}`
    };
  }
});

app.whenReady().then(() => {
  // Set NODE_ENV to development if not set
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
  }
  
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