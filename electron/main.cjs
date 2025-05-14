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
async function handleGoogleSpeechAPI(audioBuffer) {
  try {
    // First check for API key in environment variable
    const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
    
    if (apiKey) {
      // Use direct HTTP request with API key
      console.log("Using API key authentication for Google Speech");
      const https = require('https');
      const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;
      
      // Prepare request data
      const requestData = JSON.stringify({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 48000,
          languageCode: 'en-US',
        },
        audio: {
          content: Buffer.from(audioBuffer).toString('base64')
        }
      });
      
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
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(data);
              } else {
                reject(new Error(`HTTP error ${res.statusCode}: ${data}`));
              }
            });
          }
        );
        
        req.on('error', reject);
        req.write(requestData);
        req.end();
      });
      
      // Parse the response
      const result = JSON.parse(response);
      console.log("API response:", result);
      
      if (result.results && result.results.length > 0) {
        const transcription = result.results
          .map(result => result.alternatives[0].transcript)
          .join('\n');
        return transcription;
      } else {
        return "No speech detected";
      }
    } else {
      // Fall back to service account credentials file
      console.log("Using service account authentication for Google Speech");
      const speech = require('@google-cloud/speech');
      
      try {
        const client = new speech.SpeechClient({
          keyFilename: path.join(__dirname, 'google-credentials.json'),
        });
        
        const config = {
          encoding: 'LINEAR16',
          sampleRateHertz: 48000,
          languageCode: 'en-US',
        };
        
        const audio = {
          content: Buffer.from(audioBuffer).toString('base64'),
        };
        
        const request = {
          config: config,
          audio: audio,
        };
        
        const [response] = await client.recognize(request);
        const transcription = response.results
          .map(result => result.alternatives[0].transcript)
          .join('\n');
          
        return transcription;
      } catch (credErr) {
        console.error('Error with service account authentication:', credErr);
        throw new Error('No valid Google Speech authentication method found. Please provide either an API key or a credentials file.');
      }
    }
  } catch (error) {
    console.error('Error with speech recognition:', error);
    // If there's an error, return a fallback message
    return "Sorry, there was an error transcribing the audio. Please try again.";
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
ipcMain.handle('save-audio-file', async (event, { buffer, filename }) => {
  try {
    // Create recordings directory if it doesn't exist
    const recordingsDir = path.join(app.getPath('documents'), 'Friday Recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    // Create a timestamp-based filename if none provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalFilename = filename || `recording-${timestamp}.wav`;
    
    // Full path to save the file
    const filePath = path.join(recordingsDir, finalFilename);
    
    // Write the buffer to disk
    fs.writeFileSync(filePath, Buffer.from(buffer));
    
    return {
      success: true,
      filePath,
      message: `File saved to ${filePath}`
    };
  } catch (error) {
    console.error('Error saving audio file:', error);
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