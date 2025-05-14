const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (process.platform === 'win32') {
  app.setAppUserModelId('com.friday.app');
}

let mainWindow;

// Handle the Google Speech-to-Text API calls
async function handleGoogleSpeechAPI(audioBuffer) {
  try {
    // In a real implementation, you would use the @google-cloud/speech package
    // For this demo, we'll just return a placeholder response
    console.log('Received audio buffer of size:', audioBuffer.byteLength);
    
    // Simulate API processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Return a fake transcription
    return "This is a simulated transcription from Google Speech API.";
    
    /*
    // IMPLEMENTATION WITH ACTUAL GOOGLE SPEECH API:
    
    // Requires: npm install @google-cloud/speech
    const speech = require('@google-cloud/speech');
    
    // Creates a client with credentials
    const client = new speech.SpeechClient({
      keyFilename: path.join(__dirname, 'google-credentials.json'),
    });
    
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
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
    */
  } catch (error) {
    console.error('Error with speech recognition:', error);
    throw error;
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
ipcMain.handle('invoke-google-speech', async (event, audioBuffer) => {
  return await handleGoogleSpeechAPI(audioBuffer);
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