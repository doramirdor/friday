import dotenv from 'dotenv';
import { fileURLToPath } from "url";
import path from "path";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env files in the project root
const projectRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.join(projectRoot, '.env.local') });

import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from "electron";
import os from "os";
import fs from "fs";
import speech from "@google-cloud/speech";
import { promisify } from "util";
import { exec as execCallback } from "child_process";
import https from 'https';
import isDev from "electron-is-dev";
import pkg from "@google-cloud/speech/build/protos/protos.js";
const { google } = pkg;

// Import our handlers
import { setupTranscriptHandlers } from "./transcript-handler.js";
import { setupDatabaseHandlers } from "./database-handler.js";

// Import streaming speech handler (CommonJS module)
const streamingSpeechHandlerModule = await import("./streaming-speech-handler.cjs");
const streamingSpeechHandler = streamingSpeechHandlerModule.default || streamingSpeechHandlerModule;
console.log('🔍 Streaming handler module keys:', Object.keys(streamingSpeechHandlerModule));

// Import semi-live speech handler (CommonJS module) and ensure it's initialized
const semiLiveSpeechHandlerModule = await import("./semi-live-speech-handler.cjs");
const semiLiveSpeechHandler = semiLiveSpeechHandlerModule.default || semiLiveSpeechHandlerModule;
console.log('🔍 Semi-live handler module keys:', Object.keys(semiLiveSpeechHandlerModule));

// Import local modules using dynamic import since they're CommonJS
const { checkPermissions } = await import("./utils/permission.js");
const { startRecording, stopRecording } = await import("./utils/recording.js");

const exec = promisify(execCallback);

// Helper function to safely extract transcript text from either string or object responses
const getTranscriptText = (transcription) => {
  if (typeof transcription === 'string') {
    return transcription;
  } else if (transcription && typeof transcription === 'object' && transcription.transcript) {
    return transcription.transcript;
  } else if (transcription && typeof transcription === 'object' && transcription.transcription) {
    return transcription.transcription;
  } else {
    return String(transcription || 'No transcription available');
  }
};

// Helper function to safely log transcript with substring
const logTranscript = (label, transcription, maxLength = 50) => {
  const text = getTranscriptText(transcription);
  const truncated = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  console.log(`${label}:`, truncated);
};

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
    
    // Update API endpoint for long-running operations
    const apiUrl = `https://speech.googleapis.com/v1/speech:longrunningrecognize?key=${apiKey}`;
    
    const requestData = JSON.stringify({
      config: {
        encoding: options.encoding || 'MP3',
        sampleRateHertz: options.sampleRateHertz || 16000,
        languageCode: options.languageCode || 'en-US',
        model: 'latest_long',  // Use latest_long model for better diarization
        enableAutomaticPunctuation: true,
        useEnhanced: true,
        diarizationConfig: {
          enableSpeakerDiarization: true,
          minSpeakerCount: 1,
          maxSpeakerCount: 10
        },
        // Enable word-level confidence and timestamps for better speaker tracking
        enableWordConfidence: true,
        enableWordTimeOffsets: true
      },
      audio: {
        content: audioBase64
      }
    });

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const req = https.request(apiUrl, requestOptions, async (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', async () => {
        try {
          const responseBody = Buffer.concat(chunks).toString();
          console.log('🌐 main.js: Initial API response:', responseBody.substring(0, 500) + '...');
          
          if (res.statusCode !== 200) {
            return reject(new Error(`API request failed with status ${res.statusCode}: ${responseBody}`));
          }
          
          const operationResponse = JSON.parse(responseBody);
          const operationName = operationResponse.name;
          
          if (!operationName) {
            return reject(new Error('No operation name received from API'));
          }
          
          // Poll for operation completion
          let result;
          let attempts = 0;
          const maxAttempts = 30; // Maximum 5 minutes (30 * 10 seconds)
          
          while (attempts < maxAttempts) {
            attempts++;
            
            // Wait 10 seconds between polls
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Check operation status
            const checkUrl = `https://speech.googleapis.com/v1/operations/${operationName}?key=${apiKey}`;
            
            try {
              const checkResponse = await new Promise((resolveCheck, rejectCheck) => {
                https.get(checkUrl, (checkRes) => {
                  const checkChunks = [];
                  
                  checkRes.on('data', (chunk) => checkChunks.push(chunk));
                  
                  checkRes.on('end', () => {
                    const checkBody = Buffer.concat(checkChunks).toString();
                    resolveCheck(JSON.parse(checkBody));
                  });
                  
                  checkRes.on('error', rejectCheck);
                });
              });
              
              console.log(`🔄 Checking operation status (attempt ${attempts}):`, checkResponse.done ? 'DONE' : 'IN_PROGRESS');
              
              if (checkResponse.done) {
                result = checkResponse.response;
                break;
              }
            } catch (checkError) {
              console.error('Error checking operation status:', checkError);
              // Continue polling despite error
            }
          }
          
          if (!result) {
            return reject(new Error('Operation timed out or failed to complete'));
          }
          
          if (!result.results || result.results.length === 0) {
            console.log('⚠️ main.js: No transcription results from API');
            return resolve('No speech detected');
          }
          
          // Process speaker diarization results
          const words = result.results
            .flatMap(r => {
              console.log('Debug - Result:', r);
              console.log('Debug - Result alternatives:', r.alternatives);
              console.log('Debug - Result alternatives[0]:', r.alternatives[0]);
              console.log('Debug - Result alternatives[0] words:', r.alternatives[0].words);
              if (!r.alternatives || !r.alternatives[0]) return [];
              const alternative = r.alternatives[0];
              // Only return words that have speakerTag
              return (alternative.words || []).filter(word => word.speakerTag !== undefined);
            });
          
          console.log('Debug - Words array length:', words.length);
          console.log('Debug - First few words:', JSON.stringify(words.slice(0, 5), null, 2));
          
          if (words.length > 0 && words.some(word => word.speakerTag !== undefined)) {
            // Get unique speaker tags and map them to sequential IDs
            const uniqueSpeakers = [...new Set(words.map(word => word.speakerTag))].sort();
            const speakerMap = new Map(uniqueSpeakers.map((tag, index) => [tag, (index + 1).toString()]));
            
            console.log('Debug - Speaker mapping:', Object.fromEntries(speakerMap));
            
            // Group contiguous words by speaker
            let currentSpeaker = words[0].speakerTag;
            let segments = [];
            let currentText = '';
            
            words.forEach(({ word, speakerTag }, index) => {
              // Map the speaker tag to our sequential ID format
              const mappedSpeakerId = speakerMap.get(speakerTag);
              
              if (speakerTag !== currentSpeaker || index === 0) {
                // Add the accumulated text for the current speaker
                if (currentText && index !== 0) {
                  const prevMappedId = speakerMap.get(currentSpeaker);
                  segments.push(`Speaker ${prevMappedId}: ${currentText.trim()}`);
                }
                // Start new speaker segment
                currentSpeaker = speakerTag;
                currentText = word;
              } else {
                currentText += ` ${word}`;
              }
            });
            
            // Add the last segment
            if (currentText) {
              const finalMappedId = speakerMap.get(currentSpeaker);
              segments.push(`Speaker ${finalMappedId}: ${currentText.trim()}`);
            }
            
            const diarizedTranscript = segments.join('\n');
            console.log('🎯 main.js: Diarized transcript:', diarizedTranscript);
            
            // Return both the transcript and speaker information
            const response = {
              transcript: diarizedTranscript,
              speakers: Array.from(speakerMap.values()).map(id => ({
                id,
                name: `Speaker ${id}`,
                color: ["#28C76F", "#7367F0", "#FF9F43"][parseInt(id) - 1] || "#666666"
              }))
            };
            
            console.log('🎯 main.js: Response with speakers:', response);
            return resolve(response);
          }
          
          // Fallback to single-speaker transcript
          const transcription = result.results
            .map(result => result.alternatives[0].transcript)
            .join('\n')
            .trim();
          
          logTranscript('🎯 main.js: Single-speaker transcript', transcription);
          return resolve({ 
            transcript: transcription,
            speakers: [{ id: "1", name: "Speaker 1", color: "#28C76F" }]
          });
          
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
          
        logTranscript('🎯 main.js: Transcription received', transcription);
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
    setupTranscriptHandlers();
    setupDatabaseHandlers(ipcMain);
    
    // Initialize speech handlers (they set up their own IPC handlers)
    console.log('🔧 Initializing speech handlers...');
    // The streaming and semi-live speech handlers are already imported and automatically set up their IPC handlers
    // No additional setup needed as they register handlers in their constructors
    console.log('✅ Semi-live speech handler initialized:', !!semiLiveSpeechHandler);
    console.log('✅ Streaming speech handler initialized:', !!streamingSpeechHandler);
    
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

// Handle saving audio file
ipcMain.handle("save-audio-file", async (event, { buffer, filename, formats = ['mp3'] }) => {
  try {
    console.log(`🔄 main.js: Saving audio file: ${filename} with formats:`, formats);
    console.log(`🔍 main.js DEBUG: Received parameters:`, {
      bufferType: buffer?.constructor?.name,
      bufferSize: buffer?.byteLength || buffer?.length || 'unknown',
      filename,
      formats
    });
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(app.getPath('userData'), 'recordings');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`🔍 main.js DEBUG: Created output directory: ${outputDir}`);
    }
    
    // Generate timestamp for unique filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Convert ArrayBuffer to Buffer if necessary
    let bufferToWrite;
    if (buffer instanceof ArrayBuffer) {
      bufferToWrite = Buffer.from(buffer);
      console.log(`🔍 main.js DEBUG: Converted ArrayBuffer to Buffer (${bufferToWrite.length} bytes)`);
    } else if (Buffer.isBuffer(buffer)) {
      bufferToWrite = buffer;
      console.log(`🔍 main.js DEBUG: Using existing Buffer (${bufferToWrite.length} bytes)`);
    } else {
      console.error(`❌ main.js DEBUG: Unexpected buffer type: ${buffer?.constructor?.name}`);
      throw new Error(`Unexpected buffer type: ${buffer?.constructor?.name}`);
    }
    
    // Detect audio format from buffer header
    const bufferHeader = bufferToWrite.slice(0, 16);
    const headerHex = bufferHeader.toString('hex');
    console.log(`🔍 main.js DEBUG: Audio buffer header: ${headerHex}`);
    
    let detectedFormat = 'unknown';
    let nativeExtension = 'bin';
    
    // WebM/Matroska magic bytes: 1A 45 DF A3
    if (headerHex.includes('1a45dfa3')) {
      detectedFormat = 'webm';
      nativeExtension = 'webm';
      console.log('🔍 main.js DEBUG: Detected WebM format');
    }
    // WAV magic bytes: RIFF (52494646) + WAVE (57415645)
    else if (headerHex.includes('52494646') && bufferToWrite.slice(8, 12).toString('ascii') === 'WAVE') {
      detectedFormat = 'wav';
      nativeExtension = 'wav';
      console.log('🔍 main.js DEBUG: Detected WAV format');
    }
    // OGG magic bytes: OggS (4F676753)
    else if (headerHex.includes('4f676753')) {
      detectedFormat = 'ogg';
      nativeExtension = 'ogg';
      console.log('🔍 main.js DEBUG: Detected OGG format');
    }
    // MP3 magic bytes: ID3 (494433) or MPEG frame sync (FFFB/FFF3)
    else if (headerHex.includes('494433') || headerHex.includes('fffb') || headerHex.includes('fff3')) {
      detectedFormat = 'mp3';
      nativeExtension = 'mp3';
      console.log('🔍 main.js DEBUG: Detected MP3 format');
    }
    
    console.log(`🔍 main.js DEBUG: Detected format: ${detectedFormat}, native extension: ${nativeExtension}`);
    
    // Save files in requested formats
    const savedFiles = [];
    
    // First, always save in native format
    const nativePath = path.join(outputDir, `${filename}_${timestamp}.${nativeExtension}`);
    console.log(`🔍 main.js DEBUG: Saving native format to: ${nativePath}`);
    
    try {
      fs.writeFileSync(nativePath, bufferToWrite);
      console.log(`✅ main.js: Saved native ${nativeExtension} file: ${nativePath}`);
      
      if (fs.existsSync(nativePath)) {
        const fileStats = fs.statSync(nativePath);
        console.log(`🔍 main.js DEBUG: Native file created successfully, size: ${fileStats.size} bytes`);
        
        savedFiles.push({
          format: nativeExtension,
          path: nativePath
        });
      }
    } catch (nativeError) {
      console.error(`❌ main.js: Error saving native format:`, nativeError);
      throw new Error(`Failed to save native format: ${nativeError.message}`);
    }
    
    // Now convert to other requested formats
    for (const format of formats) {
      const formatLower = format.toLowerCase();
      
      // Skip if we already saved this format as native
      if (formatLower === nativeExtension) {
        console.log(`🔍 main.js DEBUG: Skipping ${format} - already saved as native format`);
        continue;
      }
      
      try {
        console.log(`🔍 main.js DEBUG: Converting to format: ${format}`);
        
        // Generate output path
        const outputPath = path.join(outputDir, `${filename}_${timestamp}.${formatLower}`);
        console.log(`🔍 main.js DEBUG: Output path: ${outputPath}`);
        
        // Use ffmpeg to convert from native format to target format
        console.log(`🔄 main.js: Converting ${nativeExtension} to ${formatLower} using ffmpeg`);
        
        const ffmpegCmd = `ffmpeg -i "${nativePath}" -acodec libmp3lame -ab 128k "${outputPath}" -y`;
        console.log(`🔍 main.js DEBUG: FFmpeg command: ${ffmpegCmd}`);
        
        await exec(ffmpegCmd);
        console.log(`🔍 main.js DEBUG: FFmpeg conversion completed`);
        
        // Check if file was created successfully
        if (fs.existsSync(outputPath)) {
          const fileStats = fs.statSync(outputPath);
          console.log(`🔍 main.js DEBUG: Converted file created successfully, size: ${fileStats.size} bytes`);
          
          // Add to saved files list
          savedFiles.push({
            format: formatLower,
            path: outputPath
          });
          
          console.log(`✅ main.js: Converted to ${formatLower} file: ${outputPath}`);
        } else {
          throw new Error(`Converted file was not created: ${outputPath}`);
        }
      } catch (formatError) {
        console.error(`❌ main.js: Error converting to ${format}:`, formatError);
        console.error(`❌ main.js DEBUG: Format error stack:`, formatError.stack);
        // Don't fail the entire operation if one format fails
      }
    }
    
    if (savedFiles.length === 0) {
      throw new Error('Failed to save in any format');
    }
    
    console.log(`✅ main.js: Successfully saved ${savedFiles.length} files:`, savedFiles.map(f => `${f.format}: ${f.path}`));
    
    return {
      success: true,
      files: savedFiles,
      message: `Saved ${savedFiles.length} files`
    };
  } catch (error) {
    console.error('❌ main.js: Error saving audio file:', error);
    console.error('❌ main.js DEBUG: Error stack:', error.stack);
    return {
      success: false,
      error: error.message,
      message: 'Failed to save audio file'
    };
  }
});

// Add these utility functions for audio processing
function splitAudioBuffer(buffer, format, chunkDurationMs = 60000) { // 60 seconds (1 minute) chunks
  // For MP3 and other compressed formats, we need to use time-based approach
  if (format === 'MP3' || format === 'OGG_OPUS') {
    // We'll use file size as a proxy for duration
    const totalSize = buffer.length;
    // Estimate bytes per second based on typical compression ratios
    // MP3 at 128kbps = 16KB/s, so 60s would be roughly 960KB
    const bytesPerChunk = 960 * 1024; // 960KB per chunk for 1 minute
    
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
    const headerSize = 44; // Include WAV header size
    
    const audioData = buffer.slice(headerSize);
    const totalAudioSize = audioData.length;
    const numChunks = Math.ceil(totalAudioSize / bytesPerChunk);
    
    console.log(`🔪 Splitting ${format} audio (${totalAudioSize} bytes) into ${numChunks} chunks of ~${bytesPerChunk} bytes`);
    
    const chunks = [];
    for (let i = 0; i < numChunks; i++) {
      const start = i * bytesPerChunk;
      const end = Math.min(start + bytesPerChunk, totalAudioSize);
      
      // For each chunk, create a new WAV file with header
      const chunkWithHeader = Buffer.alloc(end - start + headerSize);
      
      // Copy WAV header
      buffer.copy(chunkWithHeader, 0, 0, headerSize);
      
      // Update the data size in the header (bytes 4-7)
      const dataSize = end - start;
      chunkWithHeader.writeUInt32LE(dataSize, 4);
      
      // Update the chunk size in the header (bytes 40-43)
      chunkWithHeader.writeUInt32LE(dataSize, 40);
      
      // Copy the audio data
      audioData.copy(chunkWithHeader, headerSize, start, end);
      
      chunks.push(chunkWithHeader);
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
  
  // Split the audio into 1-minute chunks
  const chunks = splitAudioBuffer(audioBuffer, encoding);
  console.log(`🧩 Split audio into ${chunks.length} chunks of 1 minute each`);
  
  // Process each chunk and collect the results
  let combinedTranscription = '';
  let chunkErrors = [];
  let processedChunks = 0;
  
  // Process chunks sequentially to avoid overwhelming the API
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`🔄 Processing chunk ${i+1}/${chunks.length} (${chunk.length} bytes)`);
    
    try {
      // Add a small delay between chunks to avoid rate limiting
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Process this chunk using the regular speech API handler
      const transcription = await handleGoogleSpeechAPI(chunk, {
        ...options,
        encoding
      });
      
      if (transcription && !transcription.startsWith('Error:') && transcription !== 'No speech detected') {
        // Add a timestamp for each chunk
        const timestamp = new Date().toISOString();
        const chunkStartTime = new Date(Date.now() - (chunks.length - i - 1) * 60000).toISOString();
        
        if (combinedTranscription) {
          combinedTranscription += '\n\n';
        }
        combinedTranscription += `[${chunkStartTime}]\n${transcription}`;
        
        processedChunks++;
        console.log(`✅ Chunk ${i+1}: Got transcription of length ${transcription.length}`);
        
        // Send progress update to renderer
        if (global.mainWindow) {
          global.mainWindow.webContents.send('transcription-progress', {
            processedChunks,
            totalChunks: chunks.length,
            currentChunk: i + 1,
            timestamp: new Date().toISOString()
          });
        }
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
    const encoding = typeof options === 'object' ? options.encoding : undefined;
    const sampleRateHertz = typeof options === 'object' ? options.sampleRateHertz : undefined;
    const languageCode = typeof options === 'object' ? options.languageCode : undefined;
    
    console.log('🧪 main.js: Testing speech recognition with audio file:', filePath);
    console.log('🔧 main.js: Options:', {
      encoding,
      sampleRateHertz,
      languageCode,
      hasApiKey: !!apiKey
    });

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

    // Check file size to determine if we need to use the long audio handler
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB (Cloud Speech API limit)
    const isLongAudio = audioBuffer.length > MAX_SIZE;

    let transcription;
    if (isLongAudio) {
      console.log(`📊 main.js: Large audio file detected (${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB), using chunked processing`);
      try {
        transcription = await handleLongAudioTranscription(audioBuffer, encoding || 'MP3', {
          sampleRateHertz: sampleRateHertz || 16000,
          languageCode: languageCode || 'en-US',
          apiKey
        });
      } catch (chunkError) {
        console.error('❌ main.js: Error in chunked processing:', chunkError);
        return { error: `File too large (${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB). The maximum size is 10MB. Please use a shorter recording.` };
      }
    } else {
      // Call the existing function to process the audio
      transcription = await handleGoogleSpeechAPI(audioBuffer, {
        encoding: encoding || 'MP3',
        sampleRateHertz: sampleRateHertz || 16000,
        languageCode: languageCode || 'en-US',
        apiKey
      });
    }

    logTranscript('📝 main.js: Transcription result', transcription, 100);
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
    
    logTranscript('📝 main.js: Auto-transcription result', transcription, 100);
    
    // Send the transcript to the renderer - extract text if it's an object
    const transcriptText = getTranscriptText(transcription);
    global.mainWindow.webContents.send('recording-transcription', {
      filePath,
      transcription: transcriptText,
      timestamp: new Date().toISOString()
    });
    
    return { success: true, transcription: transcriptText };
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

// Handle reading audio file as buffer for Gemini transcription
ipcMain.handle("readAudioFile", async (event, filepath) => {
  try {
    console.log(`🔄 main.js: Reading audio file for Gemini: ${filepath}`);
    
    if (!fs.existsSync(filepath)) {
      console.error(`❌ main.js: Audio file not found: ${filepath}`);
      return { success: false, error: "File not found" };
    }
    
    // Get file stats to check size
    const stats = fs.statSync(filepath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`📊 main.js: Audio file size: ${fileSizeMB.toFixed(2)} MB`);
    
    // Check if file is too large (Gemini has file size limits)
    if (fileSizeMB > 20) {
      console.log(`⚠️ main.js: File is too large (${fileSizeMB.toFixed(2)} MB) for Gemini transcription`);
      return { 
        success: false, 
        error: `File too large for Gemini transcription (${fileSizeMB.toFixed(2)} MB). Maximum size is 20MB.`
      };
    }
    
    // Read the audio file as buffer
    const buffer = fs.readFileSync(filepath);
    console.log(`✅ main.js: Read audio file: ${buffer.length} bytes`);
    
    return {
      success: true,
      buffer: buffer,
      fileSizeMB: fileSizeMB
    };
  } catch (error) {
    console.error(`❌ main.js: Error reading audio file: ${error.message}`);
    return { 
      success: false,
      error: error.message
    };
  }
});

// Test specific file transcription
async function testSpecificFileTranscription(filePath) {
  try {
    console.log('🔄 Testing transcription for specific file:', filePath);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`✅ Read audio file of size ${audioBuffer.length} bytes`);
    
    // For MP3 files, we'll use the long audio transcription handler
    // which includes MP3 to WAV conversion and chunking
    const transcription = await handleLongAudioTranscription(audioBuffer, 'MP3', {
      sampleRateHertz: 16000,
      languageCode: 'en-US'
    });
    
    return transcription;
  } catch (error) {
    console.error('❌ Error testing file transcription:', error);
    throw error;
  }
}

// Add IPC handler for testing specific file
ipcMain.handle('test-specific-file', async (event, filePath) => {
  try {
    const transcription = await testSpecificFileTranscription(filePath);
    return { success: true, transcription };
  } catch (error) {
    console.error('Error testing specific file:', error);
    return { success: false, error: error.message };
  }
});

// Add a handler to delete a file
ipcMain.handle("delete-file", async (event, filepath) => {
  try {
    console.log(`🔄 main.js: Deleting file: ${filepath}`);
    
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️ main.js: File does not exist, nothing to delete: ${filepath}`);
      return { success: true, message: "File does not exist" };
    }
    
    fs.unlinkSync(filepath);
    console.log(`✅ main.js: Successfully deleted file: ${filepath}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ main.js: Error deleting file: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Semi-Live Recording Handlers for Live Transcription
let semiLiveRecordingProcess = null;
let semiLiveRecordingPath = null;
let semiLiveChunkCounter = 0;
let semiLiveRecordingId = null;
let semiLiveRecordingActive = false;
let semiLiveBaseFilename = null;

// Start semi-live recording with chunked output
ipcMain.handle("start-semi-live-recording", async (_, options = {}) => {
  try {
    console.log('🎤 Starting continuous semi-live recording for live transcription:', options);
    
    const { chunkDurationMs = 3000, source = 'mic', filename = 'live_transcript' } = options;
    
    // Generate simple recording ID
    semiLiveRecordingId = `${filename}_${Date.now()}`;
    semiLiveBaseFilename = semiLiveRecordingId;
    const documentsPath = app.getPath("documents");
    const fridayRecordingsPath = path.join(documentsPath, "Friday Recordings", "live-chunks");
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(fridayRecordingsPath)) {
      try {
        fs.mkdirSync(fridayRecordingsPath, { recursive: true });
        console.log(`Created live-chunks recordings directory at ${fridayRecordingsPath}`);
      } catch (error) {
        console.error(`Failed to create live-chunks recordings directory: ${error.message}`);
      }
    }
    
    semiLiveRecordingPath = fridayRecordingsPath;
    semiLiveChunkCounter = 0;
    semiLiveRecordingActive = true;
    
    // Start continuous recording using the existing recording infrastructure
    // This will create a single ongoing recording session
    try {
      await startRecording({
        filepath: semiLiveRecordingPath,
        filename: semiLiveBaseFilename,
        source: source
      });
      
      console.log(`✅ Continuous recording started for ${source} source with ${chunkDurationMs}ms chunk intervals`);
      
      return { success: true, recordingId: semiLiveRecordingId, path: semiLiveRecordingPath };
    } catch (recordingError) {
      console.error('❌ Error starting continuous recording:', recordingError);
      semiLiveRecordingActive = false;
      return { success: false, error: recordingError.message };
    }
    
  } catch (error) {
    console.error("Error starting semi-live recording:", error);
    return { success: false, error: error.message };
  }
});

// Request a chunk from the ongoing recording
ipcMain.handle("request-semi-live-chunk", async (_, options = {}) => {
  try {
    if (!semiLiveRecordingId || !semiLiveRecordingPath || !semiLiveRecordingActive) {
      throw new Error('Semi-live recording not active');
    }
    
    const { filename = `chunk_${semiLiveChunkCounter++}` } = options;
    // Create clean chunk filename
    const chunkFilename = `${semiLiveBaseFilename}_${filename}`;
    const chunkFilePath = path.join(semiLiveRecordingPath, `${chunkFilename}.mp3`);
    
    console.log(`📁 Creating chunk from ongoing recording: ${chunkFilename}.mp3`);
    console.log(`📍 Full chunk path: ${chunkFilePath}`);
    
    // For now, we'll create actual test chunk files to verify the system works
    // In production, this would extract audio from the ongoing recording buffer
    try {
      console.log(`🔧 Generating test chunk with ffmpeg...`);
      
      // Use execSync for more reliable file creation
      const { execSync } = await import('child_process');
      
      const ffmpegCommand = `ffmpeg -f lavfi -i "anullsrc=r=44100:cl=mono" -t 3 -c:a libmp3lame -b:a 64k -y "${chunkFilePath}"`;
      console.log(`🔧 FFmpeg command: ${ffmpegCommand}`);
      
      // Execute ffmpeg synchronously to ensure file is created
      execSync(ffmpegCommand, { stdio: 'pipe' });
      
      console.log(`✅ FFmpeg command completed`);
      
      // Verify the file exists with multiple checks
      let fileExists = false;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (!fileExists && attempts < maxAttempts) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
        
        if (fs.existsSync(chunkFilePath)) {
          const stats = fs.statSync(chunkFilePath);
          if (stats.size > 0) {
            fileExists = true;
            console.log(`✅ Chunk file verified: ${chunkFilePath} (${stats.size} bytes)`);
          } else {
            console.log(`⚠️ Chunk file exists but is empty (attempt ${attempts})`);
          }
        } else {
          console.log(`⚠️ Chunk file does not exist yet (attempt ${attempts})`);
        }
      }
      
      if (!fileExists) {
        throw new Error(`Failed to create chunk file after ${maxAttempts} attempts`);
      }
      
      // Get final file stats
      const finalStats = fs.statSync(chunkFilePath);
      
      // Notify frontend that chunk is ready
      const chunkData = {
        filePath: chunkFilePath,
        timestamp: Date.now(),
        chunkIndex: semiLiveChunkCounter - 1,
        size: finalStats.size
      };
      
      console.log(`📁 Semi-live chunk ready: ${chunkFilePath} (${chunkData.size} bytes)`);
      global.mainWindow.webContents.send("semi-live-chunk-ready", chunkData);
      
      return { success: true, chunkPath: chunkFilePath, size: finalStats.size };
      
    } catch (ffmpegError) {
      console.error('❌ Error generating chunk:', ffmpegError);
      console.error('❌ FFmpeg error details:', ffmpegError.message);
      return { success: false, error: ffmpegError.message };
    }
    
  } catch (error) {
    console.error("Error requesting semi-live chunk:", error);
    return { success: false, error: error.message };
  }
});

// Stop semi-live recording
ipcMain.handle("stop-semi-live-recording", async () => {
  try {
    console.log('🛑 Stopping continuous semi-live recording...');
    
    semiLiveRecordingActive = false;
    
    // Stop the ongoing recording
    if (semiLiveRecordingId) {
      try {
        const result = await stopRecording();
        console.log('✅ Continuous recording stopped:', result);
      } catch (stopError) {
        console.warn('⚠️ Warning stopping recording:', stopError);
      }
    }
    
    // Reset semi-live state
    semiLiveRecordingPath = null;
    semiLiveChunkCounter = 0;
    semiLiveRecordingId = null;
    semiLiveBaseFilename = null;
    semiLiveRecordingProcess = null;
    
    console.log('✅ Semi-live recording stopped and state reset');
    return { success: true };
  } catch (error) {
    console.error("Error stopping semi-live recording:", error);
    return { success: false, error: error.message };
  }
});

// Handle writing temporary audio files for live transcription
ipcMain.handle("writeTemporaryFile", async (event, buffer, filename) => {
  try {
    console.log(`🔄 main.js: Writing temporary file: ${filename}`);
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(app.getPath('userData'), 'recordings');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate output path
    const outputPath = path.join(outputDir, filename);
    
    // Write the buffer directly to file
    fs.writeFileSync(outputPath, buffer);
    
    // Verify file was created
    if (fs.existsSync(outputPath)) {
      const fileStats = fs.statSync(outputPath);
      console.log(`✅ main.js: Temporary file written successfully: ${outputPath} (${fileStats.size} bytes)`);
      
      return {
        success: true,
        filePath: outputPath,
        size: fileStats.size
      };
    } else {
      throw new Error(`File was not created: ${outputPath}`);
    }
  } catch (error) {
    console.error('❌ main.js: Error writing temporary file:', error);
    return {
      success: false,
      error: error.message
    };
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