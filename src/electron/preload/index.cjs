const { contextBridge, ipcRenderer } = require('electron');

// Try to load the transcript-bridge module directly
let transcriptBridge;
try {
  // First try direct path
  transcriptBridge = require('./transcript-bridge.js');
} catch (e) {
  try {
    // Then try the full path in case we're in a bundled environment
    transcriptBridge = require(require('path').join(__dirname, 'transcript-bridge.js'));
  } catch (err) {
    console.error('Failed to load transcript-bridge module:', err);
    // Create a dummy function to prevent errors
    transcriptBridge = { exposeTranscriptAPI: () => console.warn('Transcript API not available') };
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Platform info
  platform: process.platform,
  isElectron: true,
  
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
  saveAudioFile: async (buffer, filename, formats = ['wav', 'mp3']) => {
    return await ipcRenderer.invoke("save-audio-file", { buffer, filename, formats });
  },

  // Load audio file as data URL to avoid security restrictions
  loadAudioFile: async (filepath) => {
    return await ipcRenderer.invoke("load-audio-file", filepath);
  },
  
  // Play audio file using native player
  playAudioFile: async (filepath) => {
    return await ipcRenderer.invoke("play-audio-file", filepath);
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
  }
}); 

// Expose the transcript API to the renderer process
try {
  transcriptBridge.exposeTranscriptAPI();
  console.log('✅ Transcript API exposed successfully');
} catch (err) {
  console.error('Failed to expose transcript API:', err);
} 