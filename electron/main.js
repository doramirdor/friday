const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
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
    
    // Check if the buffer is WebM/Opus (common from MediaRecorder)
    // WebM magic bytes: 1A 45 DF A3
    const isWebM = bufferHeader.includes('1a 45 df a3');
    let processedBuffer = audioBuffer;
    
    if (isWebM) {
      console.log('⚠️ main.js: Detected WebM format audio');
      
      if (encoding === 'LINEAR16') {
        // For PCM content, need to extract the raw PCM data from WebM container
        console.log('⚠️ main.js: Received WebM+PCM but need raw PCM. Using as-is but might need adjustment.');
        
        // Automatically set encoding to match the appropriate format
        console.log('🔄 main.js: Ensuring encoding is set to LINEAR16 for PCM audio');
        encoding = 'LINEAR16';
      } else if (encoding === 'LINEAR16' && options.forceLinear16) {
        // If we specifically want to force LINEAR16 for a WebM file, we'll try a simple conversion
        // In a real app, you'd want to do proper audio format conversion here
        console.log('🔄 main.js: Attempting to convert WebM to LINEAR16 format');
        
        // This is a very naive approach - in production, use a proper audio conversion library
        // Just for testing purposes, create a simple LINEAR16 buffer
        const numSamples = audioBuffer.length / 2; // Assuming 16-bit samples
        const linearBuffer = Buffer.alloc(numSamples * 2);
        
        // Just copy the data as-is (this won't work properly but is a placeholder for real conversion)
        for (let i = 0; i < numSamples; i++) {
          // Skip WebM header - very naive approach
          const sourceIndex = Math.min(i + 1000, audioBuffer.length - 2);
          if (sourceIndex + 1 < audioBuffer.length) {
            linearBuffer.writeInt16LE(audioBuffer.readInt16LE(sourceIndex), i * 2);
          }
        }
        
        processedBuffer = linearBuffer;
        encoding = 'LINEAR16';
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
    
    const config = {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      audioChannelCount: audioChannelCount,
      enableAutomaticPunctuation: true,
      model: options.model || 'default',
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
    
    console.log('🚀 main.js: Sending audio to Google Speech API...');
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