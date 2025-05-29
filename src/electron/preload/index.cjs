const { contextBridge, ipcRenderer } = require('electron');
// const path = require('path'); // Removed: 'path' module is not available in preload with nodeIntegration=false

// Try to load the transcript-bridge module directly
let transcriptBridge;
try {
  // Assume transcript-bridge.js is in the same directory or correctly resolved by require
  transcriptBridge = require('./transcript-bridge.js');
} catch (e) {
  console.error('Failed to load transcript-bridge module with direct path ./transcript-bridge.js:', e);
  // As a fallback, you might construct a path if __dirname is reliably available and points to the preload script's location
  // However, avoid using require('path') for this.
  // For now, we'll rely on the direct require or let it fail clearly if not found.
  // Create a dummy function to prevent errors if loading fails
  transcriptBridge = { exposeTranscriptAPI: () => console.warn('Transcript API not available. Module transcript-bridge.js failed to load.') };
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Platform info
  platform: process.platform,
  isElectron: true,
  
  // Environment variables (only expose specific ones for security)
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_SPEECH_API_KEY: process.env.GOOGLE_SPEECH_API_KEY,
    GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
  },
  
  // Database methods
  database: {
    create: async (name, options) => {
      return await ipcRenderer.invoke('db:create', { name, options });
    },
    get: async (dbName, docId) => {
      return await ipcRenderer.invoke('db:get', { dbName, docId });
    },
    put: async (dbName, doc) => {
      return await ipcRenderer.invoke('db:put', { dbName, doc });
    },
    remove: async (dbName, doc) => {
      return await ipcRenderer.invoke('db:remove', { dbName, doc });
    },
    query: async (dbName, options) => {
      // In the main process, pouchdb-find is needed for db.find()
      // Ensure your main process getDatabase(dbName).find(options) is correctly set up.
      return await ipcRenderer.invoke('db:query', { dbName, options });
    },
    info: async (dbName) => {
      return await ipcRenderer.invoke('db:info', { dbName });
    },
    createIndex: async (dbName, indexOptions) => {
      return await ipcRenderer.invoke('db:createIndex', { dbName, indexOptions });
    },
    getIndexes: async (dbName) => {
      return await ipcRenderer.invoke('db:getIndexes', { dbName });
    },
    bulkDocs: async (dbName, docs, options) => {
      return await ipcRenderer.invoke('db:bulkDocs', { dbName, docs, options });
    },
    cleanupLocks: async () => {
      return await ipcRenderer.invoke('db:cleanup-locks');
    }
  },
  
  // System Audio Recording methods
  systemAudio: {
    // Check if we have permissions to record system audio
    checkPermissions: async () => {
      return await ipcRenderer.invoke("check-system-audio-permissions");
    },
    
    // Start recording system audio
    startRecording: async (options = {}) => {
      return await ipcRenderer.invoke("start-system-recording", options);
    },
    
    // Stop recording system audio
    stopRecording: async () => {
      return await ipcRenderer.invoke("stop-system-recording");
    },
    
    // Listen for recording status updates
    onStatusUpdate: (callback) => {
      ipcRenderer.on("recording-status", (_, status, timestamp, filepath) => {
        callback(status, timestamp, filepath);
      });
    },
    
    // Listen for recording errors
    onError: (callback) => {
      ipcRenderer.on("recording-error", (_, errorCode) => {
        callback(errorCode);
      });
    },
    
    // Open a folder dialog to select save location
    selectFolder: () => {
      ipcRenderer.send("open-folder-dialog");
    },
    
    // Listen for folder selection result
    onFolderSelected: (callback) => {
      ipcRenderer.once("selected-folder", (_, path) => {
        callback(path);
      });
    }
  },
  
  // Microphone Recording methods
  micRecording: {
    // Start recording microphone
    startRecording: async (options = {}) => {
      return await ipcRenderer.invoke("start-mic-recording", options);
    },
    
    // Stop recording microphone
    stopRecording: async () => {
      return await ipcRenderer.invoke("stop-mic-recording");
    },
    
    // Listen for recording status updates (uses same channels as system audio)
    onStatusUpdate: (callback) => {
      ipcRenderer.on("recording-status", (_, status, timestamp, filepath) => {
        callback(status, timestamp, filepath);
      });
    },
    
    // Listen for recording errors
    onError: (callback) => {
      ipcRenderer.on("recording-error", (_, errorCode) => {
        callback(errorCode);
      });
    }
  },
  
  // Combined Recording methods (both system audio and microphone)
  combinedRecording: {
    // Start recording both system audio and microphone
    startRecording: async (options = {}) => {
      return await ipcRenderer.invoke("start-combined-recording", options);
    },
    
    // Stop recording both sources
    stopRecording: async () => {
      return await ipcRenderer.invoke("stop-combined-recording");
    },
    
    // Listen for recording status updates (uses same channels as system audio)
    onStatusUpdate: (callback) => {
      ipcRenderer.on("recording-status", (_, status, timestamp, filepath, isCombined) => {
        callback(status, timestamp, filepath, isCombined);
      });
    },
    
    // Listen for recording errors
    onError: (callback) => {
      ipcRenderer.on("recording-error", (_, errorCode) => {
        callback(errorCode);
      });
    }
  },
  
  // Audio File methods
  saveAudioFile: async (buffer, filename, formats) => {
    return await ipcRenderer.invoke("save-audio-file", { buffer, filename, formats });
  },

  // Expose writeTemporaryFile for simple file writing
  writeTemporaryFile: async (buffer, filename) => {
    return await ipcRenderer.invoke("writeTemporaryFile", buffer, filename);
  },

  // Load audio file as data URL to avoid security restrictions
  loadAudioFile: async (filepath) => {
    return await ipcRenderer.invoke("load-audio-file", filepath);
  },
  
  // Play audio file using native player
  playAudioFile: async (filepath) => {
    return await ipcRenderer.invoke("play-audio-file", filepath);
  },
  
  // Show file in native file explorer
  showItemInFolder: async (filepath) => {
    return await ipcRenderer.invoke("show-item-in-folder", filepath);
  },
  
  // Check if a file exists
  checkFileExists: async (filepath) => {
    return await ipcRenderer.invoke("check-file-exists", filepath);
  },
  
  // Delete a file
  deleteFile: async (filepath) => {
    return await ipcRenderer.invoke("delete-file", filepath);
  },
  
  // Read audio file as buffer for Gemini transcription
  readAudioFile: async (filepath) => {
    return await ipcRenderer.invoke("readAudioFile", filepath);
  },
  
  // Test functions for diagnostics
  testAudio: async (apiKey) => {
    return await ipcRenderer.invoke("test-audio", apiKey);
  },
  
  testSpeechWithFile: async (filePath, apiKey) => {
    console.log('🔄 preload.cjs: Invoking test-speech-with-file', {
      filePath,
      apiKeyProvided: apiKey ? 'Yes' : 'No'
    });
    const result = await ipcRenderer.invoke("test-speech-with-file", { filePath, apiKey });
    console.log('📥 preload.cjs: Result from test-speech-with-file:', result);
    return result;
  },
  
  // Add a listener for transcription events from audio recordings
  onRecordingTranscription: (callback) => {
    ipcRenderer.on("recording-transcription", (_, data) => {
      callback(data);
    });
  },

  // Add support for receiving recording warnings
  onRecordingWarning: (callback) => {
    ipcRenderer.on('recording-warning', (_, warningCode, warningMessage) => {
      callback(warningCode, warningMessage);
    });
  },

  // Streaming speech recognition methods
  startStreamingSpeech: async (options) => {
    return await ipcRenderer.invoke('streaming-speech:start', options);
  },
  stopStreamingSpeech: async () => {
    return await ipcRenderer.invoke('streaming-speech:stop');
  },
  onStreamingSpeechResult: (callback) => {
    ipcRenderer.on('streaming-speech:result', (event, result) => callback(result));
  },
  onStreamingSpeechError: (callback) => {
    ipcRenderer.on('streaming-speech:error', (event, error) => callback(error));
  },
  removeStreamingSpeechListeners: () => {
    ipcRenderer.removeAllListeners('streaming-speech:result');
    ipcRenderer.removeAllListeners('streaming-speech:error');
  },

  // Semi-live speech recognition methods
  startSemiLiveSpeech: async (options) => {
    return await ipcRenderer.invoke('semi-live-speech:start', options);
  },
  stopSemiLiveSpeech: async () => {
    return await ipcRenderer.invoke('semi-live-speech:stop');
  },
  onSemiLiveSpeechResult: (callback) => {
    ipcRenderer.on('semi-live-speech:result', (event, result) => callback(result));
  },
  onSemiLiveSpeechError: (callback) => {
    ipcRenderer.on('semi-live-speech:error', (event, error) => callback(error));
  },
  removeSemiLiveSpeechListeners: () => {
    ipcRenderer.removeAllListeners('semi-live-speech:result');
    ipcRenderer.removeAllListeners('semi-live-speech:error');
  },

  // Semi-Live Recording methods for Gemini 2.0 Flash Integration
  startSemiLiveRecording: async (options = {}) => {
    return await ipcRenderer.invoke("start-semi-live-recording", options);
  },
  
  stopSemiLiveRecording: async () => {
    return await ipcRenderer.invoke("stop-semi-live-recording");
  },
  
  requestSemiLiveChunk: async (options = {}) => {
    return await ipcRenderer.invoke("request-semi-live-chunk", options);
  },
  
  // Listen for semi-live chunk ready events
  onSemiLiveChunk: (callback) => {
    ipcRenderer.on("semi-live-chunk-ready", (_, chunkData) => {
      callback(chunkData);
    });
  },
  
  // Remove semi-live listeners
  removeSemiLiveListeners: () => {
    ipcRenderer.removeAllListeners('semi-live-chunk-ready');
  }
});

// Expose the transcript API to the renderer process
try {
  if (transcriptBridge && typeof transcriptBridge.exposeTranscriptAPI === 'function') {
    transcriptBridge.exposeTranscriptAPI();
    console.log('✅ Transcript API exposed successfully via transcript-bridge.js');
  } else {
    console.warn('⚠️ Transcript API could not be exposed: exposeTranscriptAPI function not found on transcriptBridge or transcriptBridge is undefined.');
     if (!transcriptBridge) {
        console.error('   Reason: transcriptBridge module itself failed to load.');
    }
  }
} catch (err) {
  console.error('❌ Failed to expose transcript API:', err);
} 