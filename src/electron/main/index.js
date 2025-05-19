import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import speech from "@google-cloud/speech";
import { promisify } from "util";
import { exec as execCallback } from "child_process";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import local modules using dynamic import since they're CommonJS
const { checkPermissions } = await import("./utils/permission.js");
const { startRecording, stopRecording } = await import("./utils/recording.js");

const exec = promisify(execCallback);

// Create or ensure the Recordings directory exists
const ensureRecordingsDirectory = () => {
  const recordingsPath = path.join(app.getPath("documents"), "Friday Recordings");
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }
  return recordingsPath;
};

// API Key - Get from env variable
const API_KEY = process.env.GOOGLE_SPEECH_API_KEY || '';

// Handle the Google Speech-to-Text API calls
async function handleGoogleSpeechAPI(audioBuffer, options = {}) {
  console.log('🔄 main.js: Handling Google Speech API request', {
    audioBufferLength: audioBuffer?.length || audioBuffer?.byteLength || 'undefined',
    options: JSON.stringify(options)
  });
  
  try {
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
    
    // Check for API key in environment variable
    const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
    
    if (!apiKey) {
      console.error('❌ main.js: No Google Speech API key found');
      throw new Error('No Google Speech API key found. Please set GOOGLE_SPEECH_API_KEY environment variable.');
    }
    
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
    console.log('🔑 main.js: Using API key authentication for Google Speech');
    
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
      return "Error: Invalid Google API key. Please check your authentication settings.";
    } else if (error.code === 3 || (error.message && error.message.includes('format'))) {
      // Google Speech API returns code 3 for invalid argument (often audio format issues)
      return "Error: Audio format not supported. Try changing the encoding in settings.";
    } else if (error.code === 7) {
      // Permission denied
      return "Error: Permission denied. Check your Google Cloud Speech permissions.";
    } else {
      return `Error: ${error.message || 'Unknown error'}`;
    }
  }
}

const createWindow = async () => {
  // Create the browser window
  global.mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.cjs"),
    },
  });

  // Check if we have permission to record system audio
  const isPermissionGranted = await checkPermissions();

  // If we have permission, load the main app, otherwise show permission request screen
  if (isPermissionGranted) {
    // In development, use Vite's dev server
    if (process.env.NODE_ENV === "development") {
      global.mainWindow.loadURL("http://localhost:8082");
      global.mainWindow.webContents.openDevTools();
    } else {
      // In production, load the built app
      global.mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
    }
  } else {
    global.mainWindow.loadFile(path.join(__dirname, "../renderer/screens/permission-denied/screen.html"));
  }
};

// IPC handlers for recording functionality
ipcMain.on("open-folder-dialog", async (event) => {
  const defaultPath = ensureRecordingsDirectory();

  const { filePaths, canceled } = await dialog.showOpenDialog(global.mainWindow, {
    properties: ["openDirectory"],
    buttonLabel: "Select Folder",
    title: "Select a folder",
    message: "Please select a folder for saving the recording",
    defaultPath: defaultPath,
  });

  if (!canceled) {
    event.sender.send("selected-folder", filePaths[0]);
  }
});

// Start recording
ipcMain.handle("start-system-recording", async (_, options = {}) => {
  try {
    const filepath = options.filepath || ensureRecordingsDirectory();
    const filename = options.filename || `recording-${Date.now()}`;

    await startRecording({
      filepath,
      filename,
    });

    return { success: true, filepath, filename };
  } catch (error) {
    console.error("Error starting recording:", error);
    return { success: false, error: error.message };
  }
});

// Stop recording
ipcMain.handle("stop-system-recording", async () => {
  try {
    const result = await stopRecording();
    
    // Auto-transcribe the recording if it was successful
    if (result.success && result.path) {
      // Do transcription in the background
      transcribeRecordingFile(result.path);
    }
    
    return { success: true, ...result };
  } catch (error) {
    console.error("Error stopping recording:", error);
    return { success: false, error: error.message };
  }
});

// Check permissions
ipcMain.handle("check-system-audio-permissions", async () => {
  const isPermissionGranted = await checkPermissions();

  if (!isPermissionGranted) {
    const response = await dialog.showMessageBox(global.mainWindow, {
      type: "warning",
      title: "Permission Required",
      message: "You need to grant permission for screen recording to capture system audio. Would you like to open System Preferences now?",
      buttons: ["Open System Preferences", "Cancel"],
    });

    if (response.response === 0) {
      shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    }
  }

  return { granted: isPermissionGranted };
});

// Listen for recording status events
ipcMain.on("recording-status", (_, status, timestamp, filepath) => {
  global.mainWindow.webContents.send("recording-status", status, timestamp, filepath);
});

// Handle the Google Speech transcription requests
ipcMain.handle('invoke-google-speech', async (event, audioBuffer, options = {}) => {
  return await handleGoogleSpeechAPI(audioBuffer, options);
});

// Handle saving audio files
ipcMain.handle('save-audio-file', async (event, { buffer, filename, formats = ['wav'] }) => {
  try {
    console.log(`🔄 main.js: Saving audio file ${filename}, formats:`, formats);
    
    const recordingsDir = ensureRecordingsDirectory();
    const timePrefix = new Date().toISOString().replace(/:/g, '-');
    const baseFilename = `${timePrefix}-${filename}`;
    
    // Save all requested formats
    const results = {};
    
    // Save WAV if requested
    if (formats.includes('wav')) {
      const wavPath = path.join(recordingsDir, `${baseFilename}.wav`);
      fs.writeFileSync(wavPath, Buffer.from(buffer));
      console.log(`✅ main.js: Saved WAV file: ${wavPath}`);
      results.wav = wavPath;
    }
    
    // Save MP3 if requested
    if (formats.includes('mp3')) {
      try {
        const mp3Path = path.join(recordingsDir, `${baseFilename}.mp3`);
        
        // Check if input is FLAC format
        const isFLAC = filename.toLowerCase().endsWith('.flac') || 
                      (buffer.length > 4 && 
                       buffer[0] === 0x66 && // 'f'
                       buffer[1] === 0x4C && // 'L'
                       buffer[2] === 0x61 && // 'a'
                       buffer[3] === 0x43);  // 'C'
        
        if (isFLAC) {
          console.log('🎵 main.js: Converting FLAC to MP3');
          // Save FLAC first
          const flacPath = path.join(recordingsDir, `${baseFilename}.flac`);
          fs.writeFileSync(flacPath, Buffer.from(buffer));
          // Convert FLAC to MP3
          await exec(`ffmpeg -i "${flacPath}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}" -y`);
          // Clean up FLAC file
          fs.unlinkSync(flacPath);
        } else {
          // Convert WAV to MP3
          const wavPath = results.wav || path.join(recordingsDir, `${baseFilename}.wav`);
          if (!results.wav) {
            fs.writeFileSync(wavPath, Buffer.from(buffer));
          }
          await exec(`ffmpeg -i "${wavPath}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}" -y`);
          if (!results.wav) {
            fs.unlinkSync(wavPath);
          }
        }
        
        console.log(`✅ main.js: Saved MP3 file: ${mp3Path}`);
        results.mp3 = mp3Path;
      } catch (error) {
        console.error('❌ main.js: Error converting to MP3:', error);
        results.mp3Error = error.message;
      }
    }
    
    return { success: true, files: results };
  } catch (error) {
    console.error('❌ main.js: Error saving audio file:', error);
    return { success: false, error: error.message };
  }
});

// Handle existing audio file transcription test
ipcMain.handle('test-speech-with-file', async (event, filePath) => {
  try {
    console.log('🧪 main.js: Testing speech recognition with audio file:', filePath);

    // Handle relative paths - convert them to absolute
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      // If path is relative, resolve from the app's root directory
      resolvedPath = path.resolve(app.getAppPath(), filePath);
      console.log(`📍 main.js: Resolved relative path to: ${resolvedPath}`);
    }

    // Check if the file exists - if not, try appending common extensions
    if (!fs.existsSync(resolvedPath)) {
      console.log(`⚠️ main.js: File not found: ${resolvedPath}, trying to add extensions...`);
      
      // Try common audio extensions
      const commonExtensions = ['.mp3', '.wav', '.ogg', '.flac'];
      let fileFound = false;
      
      for (const ext of commonExtensions) {
        const pathWithExt = resolvedPath + ext;
        if (fs.existsSync(pathWithExt)) {
          console.log(`✅ main.js: Found file with extension: ${pathWithExt}`);
          resolvedPath = pathWithExt;
          fileFound = true;
          break;
        }
      }
      
      if (!fileFound) {
        // Also try Friday Recordings directory
        const recordingsDir = path.join(app.getPath('documents'), 'Friday Recordings');
        const filename = path.basename(resolvedPath);
        
        console.log(`🔍 main.js: Looking for ${filename} in ${recordingsDir}...`);
        
        // Check if file exists in recordings directory
        const recordingPath = path.join(recordingsDir, filename);
        if (fs.existsSync(recordingPath)) {
          console.log(`✅ main.js: Found file in recordings directory: ${recordingPath}`);
          resolvedPath = recordingPath;
          fileFound = true;
        } else {
          // Try with extensions in recordings directory
          for (const ext of commonExtensions) {
            const pathWithExt = recordingPath + ext;
            if (fs.existsSync(pathWithExt)) {
              console.log(`✅ main.js: Found file with extension in recordings directory: ${pathWithExt}`);
              resolvedPath = pathWithExt;
              fileFound = true;
              break;
            }
          }
        }
      }
      
      if (!fileFound) {
        console.error(`❌ main.js: Audio file does not exist: ${resolvedPath}`);
        return { error: `File not found: ${filePath}` };
      }
    }

    // Read the file
    let audioBuffer;
    try {
      audioBuffer = fs.readFileSync(resolvedPath);
      console.log(`✅ main.js: Successfully read audio file: ${resolvedPath}, size: ${audioBuffer.length} bytes`);
    } catch (error) {
      console.error(`❌ main.js: Error reading audio file: ${resolvedPath}`, error);
      return { error: `Failed to read audio file: ${error.message}` };
    }

    // Determine encoding based on file extension
    const fileExt = path.extname(resolvedPath).toLowerCase();
    let encoding = 'LINEAR16'; // Default for WAV

    if (fileExt === '.mp3') {
      encoding = 'MP3';
      console.log('🎵 main.js: Detected MP3 format, using MP3 encoding');
    } else if (fileExt === '.ogg') {
      encoding = 'OGG_OPUS';
      console.log('🎵 main.js: Detected OGG format, using OGG_OPUS encoding');
    } else if (fileExt === '.wav') {
      encoding = 'LINEAR16';
      console.log('🎵 main.js: Detected WAV format, using LINEAR16 encoding');
    } else {
      // If no extension or unknown extension, try to detect format from file header
      if (audioBuffer && audioBuffer.length > 4) {
        // Check for MP3 signature
        if (audioBuffer[0] === 0x49 && audioBuffer[1] === 0x44 && audioBuffer[2] === 0x33 || 
            (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)) {
          console.log('🎵 main.js: Detected MP3 header signature, using MP3 encoding');
          encoding = 'MP3';
        }
        // Check for WAV signature (RIFF)
        else if (audioBuffer[0] === 0x52 && audioBuffer[1] === 0x49 && audioBuffer[2] === 0x46 && audioBuffer[3] === 0x46) {
          console.log('🎵 main.js: Detected WAV/RIFF header signature, using LINEAR16 encoding');
          encoding = 'LINEAR16';
        }
        // Check for OGG signature ("OggS")
        else if (audioBuffer[0] === 0x4F && audioBuffer[1] === 0x67 && audioBuffer[2] === 0x67 && audioBuffer[3] === 0x53) {
          console.log('🎵 main.js: Detected OGG header signature, using OGG_OPUS encoding');
          encoding = 'OGG_OPUS';
        }
        else {
          console.log(`⚠️ main.js: Unknown file format, defaulting to LINEAR16 encoding`);
        }
      }
    }

    // Call the existing function to process the audio
    const transcription = await handleGoogleSpeechAPI(audioBuffer, {
      encoding,
      sampleRateHertz: 16000,
      languageCode: 'en-US'
    });

    console.log('📝 main.js: Transcription result:', transcription);
    return transcription;
  } catch (error) {
    console.error('❌ main.js: Error testing speech with file:', error);
    return `Error: ${error.message || 'Unknown error'}`;
  }
});

// Add these new IPC handlers for microphone recording

// Automatically transcribe a recording file and send the transcript to the renderer
async function transcribeRecordingFile(filePath) {
  try {
    console.log('🔄 main.js: Auto-transcribing recording file:', filePath);
    
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`❌ main.js: Recording file doesn't exist: ${filePath}`);
      return { success: false, error: 'Recording file not found' };
    }
    
    // Read the audio file
    const audioBuffer = fs.readFileSync(filePath);
    
    // Determine encoding based on file extension
    const fileExt = path.extname(filePath).toLowerCase();
    let encoding = 'LINEAR16'; // Default for WAV
    
    if (fileExt === '.mp3') {
      encoding = 'MP3';
    } else if (fileExt === '.ogg') {
      encoding = 'OGG_OPUS';
    } else if (fileExt === '.wav') {
      encoding = 'LINEAR16';
    }
    
    // Call the existing function to process the audio
    const transcription = await handleGoogleSpeechAPI(audioBuffer, {
      encoding,
      sampleRateHertz: 44100,
      languageCode: 'en-US'
    });
    
    console.log('📝 main.js: Auto-transcription result:', transcription.substring(0, 100) + '...');
    
    // Send the transcript to the renderer
    global.mainWindow.webContents.send('recording-transcription', {
      filePath,
      transcription,
      timestamp: new Date().toISOString()
    });
    
    return { success: true, transcription };
  } catch (error) {
    console.error('❌ main.js: Error auto-transcribing recording:', error);
    global.mainWindow.webContents.send('recording-transcription', {
      filePath,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    return { success: false, error: error.message };
  }
}

// Start mic recording
ipcMain.handle("start-mic-recording", async (_, options = {}) => {
  try {
    const filepath = options.filepath || ensureRecordingsDirectory();
    const filename = options.filename || `mic-recording-${Date.now()}`;

    await startRecording({
      filepath,
      filename,
      source: "mic" // Specify microphone as the source
    });

    return { success: true, filepath, filename };
  } catch (error) {
    console.error("Error starting microphone recording:", error);
    return { success: false, error: error.message };
  }
});

// Stop mic recording (reuses the same stop function as system recording)
ipcMain.handle("stop-mic-recording", async () => {
  try {
    const result = await stopRecording();
    
    // Auto-transcribe the recording if it was successful
    if (result.success && result.path) {
      // Do transcription in the background
      transcribeRecordingFile(result.path);
    }
    
    return { success: true, ...result };
  } catch (error) {
    console.error("Error stopping microphone recording:", error);
    return { success: false, error: error.message };
  }
});

// Add the combined recording IPC handlers

// Start combined recording (both system audio and microphone)
ipcMain.handle("start-combined-recording", async (_, options = {}) => {
  try {
    const filepath = options.filepath || ensureRecordingsDirectory();
    const filename = options.filename || `combined-recording-${Date.now()}`;

    await startRecording({
      filepath,
      filename,
      source: "both"  // Use the new "both" option
    });

    return { success: true, filepath, filename };
  } catch (error) {
    console.error("Error starting combined recording:", error);
    return { success: false, error: error.message };
  }
});

// Stop combined recording (reuses the same stop function)
ipcMain.handle("stop-combined-recording", async () => {
  try {
    const result = await stopRecording();
    
    // Auto-transcribe the recording if it was successful
    if (result.success && result.path) {
      // Do transcription in the background
      transcribeRecordingFile(result.path);
    }
    
    return { success: true, ...result };
  } catch (error) {
    console.error("Error stopping combined recording:", error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
}); 