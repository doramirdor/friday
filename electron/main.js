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
  try {
    // Dynamically import Google Speech API to avoid issues with ESM/CJS compatibility
    const speech = require('@google-cloud/speech');
    
    // Configure speech options
    const sampleRateHertz = options.sampleRateHertz || 16000;
    const languageCode = options.languageCode || 'en-US';
    const encoding = options.encoding || 'LINEAR16';
    const audioChannelCount = options.audioChannelCount || 1;
    
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
      console.log('Using API key authentication for Google Speech');
    } else {
      // Fall back to service account credentials file
      try {
        const credentialsPath = path.join(__dirname, 'google-credentials.json');
        
        // Check if credentials file exists and has been populated
        if (!fs.existsSync(credentialsPath)) {
          throw new Error('Credentials file not found');
        }
        
        const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
        if (credentialsContent.includes('YOUR_PROJECT_ID')) {
          throw new Error('Credentials file contains placeholder values');
        }
        
        client = new speech.SpeechClient({
          keyFilename: credentialsPath,
        });
        console.log('Using service account credentials for Google Speech');
      } catch (credErr) {
        console.error('Error loading credentials file:', credErr);
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
    const audio = {
      content: Buffer.from(audioBuffer).toString('base64'),
    };
    
    const request = {
      config: config,
      audio: audio,
    };
    
    console.log('Sending audio to Google Speech API...');
    const [response] = await client.recognize(request);
    
    if (!response || !response.results || response.results.length === 0) {
      console.log('No transcription results returned');
      return '';
    }
    
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
      
    console.log('Transcription received:', transcription.substring(0, 50) + '...');
    return transcription;
  } catch (error) {
    console.error('Error with speech recognition:', error);
    
    // Provide more specific error messages for common issues
    if (error.message.includes('API key')) {
      return "Error: Invalid Google API key. Please check your authentication settings.";
    } else if (error.message.includes('credentials')) {
      return "Error: Google credentials file is missing or invalid. Please set up authentication.";
    } else {
      return "Sorry, there was an error transcribing the audio. Please try again.";
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