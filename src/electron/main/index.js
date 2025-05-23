import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from "electron";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import speech from "@google-cloud/speech";
import { promisify } from "util";
import { exec as execCallback } from "child_process";
import https from 'https';
import isDev from "electron-is-dev";
import pkg from "@google-cloud/speech/build/protos/protos.js";
const { google } = pkg;

// Import our new transcript handler
import { setupTranscriptHandlers } from "./transcript-handler.js";

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

// Add direct API call function using HTTPS
async function callGoogleSpeechAPIDirectly(audioBase64, options = {}) {
  return new Promise((resolve, reject) => {
    const apiKey = options.apiKey || process.env.GOOGLE_SPEECH_API_KEY || API_KEY;
    
    if (!apiKey) {
      return reject(new Error('No API key available for Google Speech API'));
    }
    
    console.log('🌐 main.js: Making direct API call to Google Speech API');
    
    const requestData = JSON.stringify({
      config: {
        encoding: options.encoding || 'LINEAR16',
        sampleRateHertz: options.sampleRateHertz || 16000,
        languageCode: options.languageCode || 'en-US',
        model: options.model || 'command_and_search',
        enableAutomaticPunctuation: true,
        useEnhanced: true
      },
      audio: {
        content: audioBase64
      }
    });
    
    const apiUrl = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;
    
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };
    
    const req = https.request(apiUrl, requestOptions, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        try {
          const responseBody = Buffer.concat(chunks).toString();
          console.log('🌐 main.js: Direct API response:', responseBody.substring(0, 500) + '...');
          
          if (res.statusCode !== 200) {
            return reject(new Error(`API request failed with status ${res.statusCode}: ${responseBody}`));
          }
          
          const jsonResponse = JSON.parse(responseBody);
          
          if (!jsonResponse.results || jsonResponse.results.length === 0) {
            console.log('⚠️ main.js: No transcription results from direct API call');
            return resolve('No speech detected');
          }
          
          const transcription = jsonResponse.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');
            
          console.log('🎯 main.js: Direct API transcription received:', transcription.substring(0, 50) + '...');
          return resolve(transcription);
        } catch (error) {
          return reject(new Error(`Error processing API response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      return reject(new Error(`API request error: ${error.message}`));
    });
    
    req.write(requestData);
    req.end();
  });
}

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
    
    // Check for API key in options, then environment variable, then global constant
    const apiKey = options.apiKey || process.env.GOOGLE_SPEECH_API_KEY || API_KEY;
    
    if (!apiKey) {
      console.error('❌ main.js: No Google Speech API key found');
      throw new Error('No Google Speech API key found. Please set GOOGLE_SPEECH_API_KEY environment variable or provide an API key.');
    }
    
    console.log('🔑 main.js: API key available:', apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No');
    
    // Create Speech client with compatibility fix for older Google Cloud Speech library versions
    let client;
    try {
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
    } catch (error) {
      // Fallback initialization if the primary method fails
      console.error('❌ main.js: Error initializing SpeechClient with standard method:', error.message);
      console.log('🔄 main.js: Trying alternative initialization method...');
      
      try {
        // Alternative initialization to work around getUniverseDomain issue
        client = new speech.SpeechClient({
          apiEndpoint: 'speech.googleapis.com'
        });
        
        // Manually set API key on client for auth
        if (!client.auth) {
          client.auth = {};
        }
        client.auth.key = apiKey;
        client.auth.getRequestHeaders = async () => {
          return { 'Authorization': `Bearer ${apiKey}` };
        };
        
        console.log('✅ main.js: Alternative initialization successful');
      } catch (altError) {
        console.error('❌ main.js: Alternative initialization also failed:', altError.message);
        throw new Error(`Could not initialize Speech client: ${error.message}, alternative method: ${altError.message}`);
      }
    }
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
    
    let transcription;
    try {
      const [response] = await client.recognize(request);
      
      console.log('📥 main.js: Received response from Google Speech API:', {
        responseExists: !!response,
        resultsLength: response?.results?.length || 0
      });
      
      if (!response || !response.results || response.results.length === 0) {
        console.log('⚠️ main.js: No transcription results returned');
        transcription = 'No speech detected';
      } else {
        transcription = response.results
          .map(result => result.alternatives[0].transcript)
          .join('\n');
          
        console.log('🎯 main.js: Transcription received:', transcription.substring(0, 50) + '...');
      }
    } catch (clientError) {
      console.error('❌ main.js: Error using client library for speech recognition:', clientError);
      console.log('🔄 main.js: Falling back to direct API call');
      
      // If the client library fails, try the direct API call
      try {
        transcription = await callGoogleSpeechAPIDirectly(audioContent, {
          encoding: finalEncoding,
          sampleRateHertz,
          languageCode,
          model: options.model || 'command_and_search',
          apiKey: apiKey
        });
      } catch (directApiError) {
        console.error('❌ main.js: Direct API call also failed:', directApiError);
        throw directApiError; // Re-throw to be caught by the outer catch block
      }
    }
    
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

// Setup handlers for system audio recording
function setupSystemAudioHandlers(recordingsPath) {
  console.log("Setting up system audio recording handlers with path:", recordingsPath);
  
  // We don't need to register these handlers again as they are already defined below
  // This function now just serves as a setup point for any future system audio functionality
}

// Setup handlers for microphone recording
function setupMicrophoneHandlers(recordingsPath) {
  console.log("Setting up microphone recording handlers with path:", recordingsPath);
  
  // We don't need to register these handlers again as they are already defined below
  // This function now just serves as a setup point for any future microphone functionality
}

// Setup handlers for combined (system + mic) recording
function setupCombinedRecordingHandlers(recordingsPath) {
  console.log("Setting up combined recording handlers with path:", recordingsPath);
  
  // We don't need to register these handlers again as they are already defined below
  // This function now just serves as a setup point for any future combined recording functionality
}

const createWindow = async () => {
  try {
    // Ensure the recording directory exists
    const recordingsPath = ensureRecordingsDirectory();

    // Set up our handlers
    setupSystemAudioHandlers(recordingsPath);
    setupMicrophoneHandlers(recordingsPath);
    setupCombinedRecordingHandlers(recordingsPath);
    
    // Set up transcript handlers 
    setupTranscriptHandlers();
    
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
  } catch (error) {
    console.error("Error creating window:", error);
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

// Add these utility functions for audio processing
function splitAudioBuffer(buffer, format, chunkDurationMs = 58000) { // 58 seconds to be safe
  // For MP3 and other compressed formats, we need to use time-based approach
  if (format === 'MP3' || format === 'OGG_OPUS') {
    // We'll use file size as a proxy for duration
    const totalSize = buffer.length;
    // Google API limit is about 60s for sync API, use 58s to be safe
    // Let's estimate bytes per second based on typical compression ratios
    // MP3 at 128kbps = 16KB/s, so 58s would be roughly 928KB
    const bytesPerChunk = 900 * 1024; // 900KB per chunk is a conservative estimate
    
    const numChunks = Math.ceil(totalSize / bytesPerChunk);
    console.log(`🔪 Splitting ${format} audio (${totalSize} bytes) into ${numChunks} chunks of ~${bytesPerChunk} bytes`);
    
    const chunks = [];
    for (let i = 0; i < numChunks; i++) {
      const start = i * bytesPerChunk;
      const end = Math.min(start + bytesPerChunk, totalSize);
      chunks.push(buffer.slice(start, end));
    }
    
    return chunks;
  } 
  // For LINEAR16 (WAV), we can do more precise splitting
  else if (format === 'LINEAR16') {
    // WAV format has 16 bits per sample, 2 channels typically
    const bytesPerSample = 2; // 16-bit = 2 bytes
    const typicalChannels = 2;
    const typicalSampleRate = 16000; // 16kHz
    
    // Calculate bytes per second (sample rate * bytes per sample * channels)
    const bytesPerSecond = typicalSampleRate * bytesPerSample * typicalChannels;
    const bytesPerChunk = (chunkDurationMs / 1000) * bytesPerSecond;
    
    // Find the header size (typically 44 bytes for WAV)
    // Skip this for now and just use the raw data
    // const headerSize = 44;
    const headerSize = 0; // For simplicity, we'll include headers in each chunk
    
    const audioData = buffer.slice(headerSize);
    const totalAudioSize = audioData.length;
    const numChunks = Math.ceil(totalAudioSize / bytesPerChunk);
    
    console.log(`🔪 Splitting ${format} audio (${totalAudioSize} bytes) into ${numChunks} chunks of ~${bytesPerChunk} bytes`);
    
    const chunks = [];
    for (let i = 0; i < numChunks; i++) {
      const start = i * bytesPerChunk;
      const end = Math.min(start + bytesPerChunk, totalAudioSize);
      
      // For the first chunk, include the header, otherwise just the data
      if (i === 0 && headerSize > 0) {
        const chunkWithHeader = Buffer.alloc(end - start + headerSize);
        buffer.copy(chunkWithHeader, 0, 0, headerSize);
        audioData.copy(chunkWithHeader, headerSize, start, end);
        chunks.push(chunkWithHeader);
      } else {
        chunks.push(audioData.slice(start, end));
      }
    }
    
    return chunks;
  }
  
  // Fallback: just return the whole buffer as one chunk
  console.log(`⚠️ Unknown format ${format}, returning single chunk`);
  return [buffer];
}

// Handle long audio transcription by splitting into chunks
async function handleLongAudioTranscription(audioBuffer, encoding, options = {}) {
  console.log(`🔄 Processing long audio file (${audioBuffer.length} bytes) with ${encoding} encoding`);
  
  // Handle MP3 format differently - we need to convert it to WAV first
  if (encoding === 'MP3') {
    console.log('🔄 Converting MP3 to WAV for chunked processing...');
    try {
      // Create temporary files for this operation
      const tempDir = path.join(os.tmpdir(), 'friday-speech');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Save the MP3 to temp file
      const inputFile = path.join(tempDir, `input-${Date.now()}.mp3`);
      fs.writeFileSync(inputFile, audioBuffer);
      
      // Output WAV file
      const outputFile = path.join(tempDir, `output-${Date.now()}.wav`);
      
      // Use ffmpeg to convert MP3 to WAV (16bit, 16kHz, mono)
      const { spawn } = await import('child_process');
      
      // Create promise for process completion
      await new Promise((resolve, reject) => {
        const ffmpegProcess = spawn('ffmpeg', [
          '-i', inputFile,             // Input file
          '-ar', '16000',              // Sample rate
          '-ac', '1',                  // Mono
          '-acodec', 'pcm_s16le',      // 16-bit PCM
          '-y',                        // Overwrite output
          outputFile                   // Output file
        ]);
        
        let ffmpegError = '';
        
        ffmpegProcess.stderr.on('data', (data) => {
          // ffmpeg logs to stderr by default
          ffmpegError += data.toString();
        });
        
        ffmpegProcess.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Successfully converted MP3 to WAV');
            resolve();
          } else {
            reject(new Error(`ffmpeg exited with code ${code}: ${ffmpegError}`));
          }
        });
        
        ffmpegProcess.on('error', (err) => {
          reject(err);
        });
      });
      
      // Now read the WAV file and use it instead
      audioBuffer = fs.readFileSync(outputFile);
      encoding = 'LINEAR16';
      
      console.log(`✅ Converted MP3 to WAV, new size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB`);
      
      // Adjust options for WAV format
      options.encoding = 'LINEAR16';
      options.sampleRateHertz = 16000;
      
      // Clean up temp files
      try {
        fs.unlinkSync(inputFile);
        fs.unlinkSync(outputFile);
      } catch (cleanupErr) {
        console.warn('⚠️ Warning: Could not clean up temp files:', cleanupErr);
      }
    } catch (conversionError) {
      console.error('❌ Error converting MP3 to WAV:', conversionError);
      throw new Error(`Failed to convert MP3 to WAV: ${conversionError.message}`);
    }
  }
  
  // Split the audio into manageable chunks
  const chunks = splitAudioBuffer(audioBuffer, encoding);
  console.log(`🧩 Split audio into ${chunks.length} chunks`);
  
  // Process each chunk and collect the results
  let combinedTranscription = '';
  let chunkErrors = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`🔄 Processing chunk ${i+1}/${chunks.length} (${chunk.length} bytes)`);
    
    try {
      // Process this chunk using the regular speech API handler
      const transcription = await handleGoogleSpeechAPI(chunk, {
        ...options,
        encoding
      });
      
      if (transcription && !transcription.startsWith('Error:') && transcription !== 'No speech detected') {
        if (combinedTranscription) combinedTranscription += ' ';
        combinedTranscription += transcription;
        console.log(`✅ Chunk ${i+1}: Got transcription of length ${transcription.length}`);
      } else if (transcription === 'No speech detected') {
        console.log(`⚠️ Chunk ${i+1}: No speech detected`);
      } else {
        console.error(`❌ Chunk ${i+1}: Error: ${transcription}`);
        chunkErrors.push(`Chunk ${i+1}: ${transcription}`);
      }
    } catch (error) {
      console.error(`❌ Error processing chunk ${i+1}:`, error);
      chunkErrors.push(`Chunk ${i+1}: ${error.message}`);
    }
  }
  
  // Return the combined results
  if (combinedTranscription) {
    if (chunkErrors.length > 0) {
      console.warn(`⚠️ Transcription completed with ${chunkErrors.length} chunk errors`);
    }
    return combinedTranscription;
  } else if (chunkErrors.length > 0) {
    return `Error: Failed to transcribe audio. ${chunkErrors.join('; ')}`;
  } else {
    return 'No speech detected in any chunk';
  }
}

// Handle existing audio file transcription test
ipcMain.handle('test-speech-with-file', async (event, options) => {
  try {
    // Handle both old and new format (string vs object)
    const filePath = typeof options === 'string' ? options : options.filePath;
    const apiKey = typeof options === 'object' ? options.apiKey : undefined;
    
    console.log('🧪 main.js: Testing speech recognition with audio file:', filePath);
    console.log('🔑 main.js: API key provided:', apiKey ? 'Yes' : 'No');

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

    // Check file size to determine if we need to use the long audio handler
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB (Cloud Speech API limit)
    const isLongAudio = audioBuffer.length > MAX_SIZE;

    let transcription;
    if (isLongAudio) {
      console.log(`📊 main.js: Large audio file detected (${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB), using chunked processing`);
      try {
        transcription = await handleLongAudioTranscription(audioBuffer, encoding, {
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          apiKey: apiKey
        });
      } catch (chunkError) {
        console.error('❌ main.js: Error in chunked processing:', chunkError);
        return { error: `File too large (${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB). The maximum size is 10MB. Please use a shorter recording.` };
      }
    } else {
      // Call the existing function to process the audio
      transcription = await handleGoogleSpeechAPI(audioBuffer, {
        encoding,
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        apiKey: apiKey // Pass the API key to the handler function
      });
    }

    console.log('📝 main.js: Transcription result:', transcription.substring(0, 100) + (transcription.length > 100 ? '...' : ''));
    return { transcription };
  } catch (error) {
    console.error('❌ main.js: Error testing speech with file:', error);
    return { error: error.message || 'Unknown error' };
  }
});

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
    console.log(`✅ main.js: Read audio file of size ${audioBuffer.length} bytes`);
    
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
    
    // Check if this is a long audio file (> 900KB or ~1 minute)
    const isLongAudio = audioBuffer.length > 900 * 1024;
    let transcription;
    
    // Process the audio based on its size
    if (isLongAudio) {
      console.log(`📊 main.js: Large recording detected (${audioBuffer.length} bytes), using chunked processing`);
      transcription = await handleLongAudioTranscription(audioBuffer, encoding, {
        sampleRateHertz: 44100,
        languageCode: 'en-US'
      });
    } else {
      // Call the existing function to process the audio
      transcription = await handleGoogleSpeechAPI(audioBuffer, {
        encoding,
        sampleRateHertz: 44100,
        languageCode: 'en-US'
      });
    }
    
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

// Handle loading audio file as data URL to avoid security restrictions
ipcMain.handle("load-audio-file", async (event, filepath) => {
  try {
    console.log(`🔄 main.js: Loading audio file: ${filepath}`);
    
    if (!fs.existsSync(filepath)) {
      console.error(`❌ main.js: Audio file not found: ${filepath}`);
      return { error: "File not found" };
    }
    
    // Get file stats to check size
    const stats = fs.statSync(filepath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`📊 main.js: Audio file size: ${fileSizeMB.toFixed(2)} MB`);
    
    // If file is large (>20MB), suggest native player instead
    if (fileSizeMB > 20) {
      console.log(`⚠️ main.js: File is large (${fileSizeMB.toFixed(2)} MB), suggesting native player`);
      return { 
        success: true, 
        originalPath: filepath,
        fileSizeMB: fileSizeMB,
        useNativePlayer: true,
        message: "File too large for browser playback, using native player"
      };
    }
    
    // Always convert MP3 to WAV for browser playback
    // This ensures better cross-browser compatibility
    const ext = path.extname(filepath).toLowerCase();
    
    // For MP3 files, always try to convert to WAV
    if (ext === ".mp3") {
      try {
        console.log(`🔄 main.js: Converting MP3 to WAV for browser compatibility`);
        const tempDir = app.getPath('temp');
        const tempWavFile = path.join(tempDir, `playback_${Date.now()}.wav`);
        
        // Convert MP3 to WAV using ffmpeg (prioritize reliability over quality)
        await exec(`ffmpeg -i "${filepath}" -acodec pcm_s16le -ar 44100 -ac 2 "${tempWavFile}" -y`);
        console.log(`✅ main.js: Converted MP3 to WAV: ${tempWavFile}`);
        
        // Read the WAV file and create data URL
        const wavBuffer = fs.readFileSync(tempWavFile);
        console.log(`✅ main.js: Read WAV file (${wavBuffer.length} bytes)`);
        
        // Create a data URL with the WAV data
        const wavDataUrl = `data:audio/wav;base64,${wavBuffer.toString("base64")}`;
        
        // Clean up the temp file
        try {
          fs.unlinkSync(tempWavFile);
        } catch (cleanupError) {
          console.warn(`⚠️ main.js: Could not delete temp WAV file: ${cleanupError.message}`);
        }
        
        return {
          success: true,
          dataUrl: wavDataUrl,
          originalPath: filepath,
          mimeType: "audio/wav",
          fileSizeMB
        };
      } catch (convError) {
        console.error(`❌ main.js: Error converting MP3 to WAV: ${convError.message}`);
        console.log(`⚠️ main.js: Falling back to native player`);
        
        // Fallback to native player if conversion fails
        return {
          success: true,
          originalPath: filepath,
          fileSizeMB,
          useNativePlayer: true,
          error: convError.message,
          message: "Conversion failed, use native player instead"
        };
      }
    }
    
    // For non-MP3 files, use standard approach
    const buffer = fs.readFileSync(filepath);
    console.log(`✅ main.js: Read audio file: ${buffer.length} bytes`);
    
    // Determine MIME type based on file extension
    let mimeType = "audio/wav"; // Default
    if (ext === ".ogg") mimeType = "audio/ogg";
    else if (ext === ".flac") mimeType = "audio/flac";
    else if (ext === ".m4a" || ext === ".aac") mimeType = "audio/aac";
    
    // Create data URL
    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    
    return {
      success: true,
      dataUrl,
      originalPath: filepath,
      mimeType,
      fileSizeMB
    };
  } catch (error) {
    console.error(`❌ main.js: Error loading audio file: ${error.message}`);
    return { 
      error: error.message,
      useNativePlayer: true  // Fallback to native player on any error
    };
  }
});

// Handle playing audio file with native player
ipcMain.handle("play-audio-file", async (event, filepath) => {
  try {
    console.log(`🔄 main.js: Playing audio file with native player: ${filepath}`);
    
    if (!fs.existsSync(filepath)) {
      console.error(`❌ main.js: Audio file not found: ${filepath}`);
      return { error: "File not found" };
    }
    
    // Use shell.openPath to open the file with the default system application
    const result = await shell.openPath(filepath);
    
    if (result) {
      console.error(`❌ main.js: Error playing audio file: ${result}`);
      return { error: result };
    }
    
    console.log(`✅ main.js: Playing audio file with native player: ${filepath}`);
    return { success: true };
  } catch (error) {
    console.error("❌ main.js: Error playing audio file:", error);
    return { error: error.message };
  }
});

// Handle showing item in folder
ipcMain.handle("show-item-in-folder", async (event, filepath) => {
  try {
    console.log(`🔄 main.js: Showing item in folder: ${filepath}`);
    
    if (!fs.existsSync(filepath)) {
      console.error(`❌ main.js: File not found: ${filepath}`);
      return { error: "File not found" };
    }
    
    // Show the file in the native file explorer
    shell.showItemInFolder(filepath);
    return { success: true };
  } catch (error) {
    console.error("❌ main.js: Error showing item in folder:", error);
    return { error: error.message };
  }
});

// Add a handler to check if a file exists and has content
ipcMain.handle("check-file-exists", async (event, filepath) => {
  try {
    console.log(`🔄 main.js: Checking if file exists: ${filepath}`);
    
    if (!fs.existsSync(filepath)) {
      console.log(`❌ main.js: File does not exist: ${filepath}`);
      return false;
    }
    
    // Check if the file has content
    const stats = fs.statSync(filepath);
    const hasContent = stats.size > 0;
    
    console.log(`✅ main.js: File exists: ${filepath}, size: ${stats.size} bytes`);
    return hasContent;
  } catch (error) {
    console.error(`❌ main.js: Error checking file: ${error.message}`);
    return false;
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