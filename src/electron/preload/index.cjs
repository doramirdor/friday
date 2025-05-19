const { contextBridge, ipcRenderer } = require('electron');

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
  
  // Test functions for diagnostics
  testAudio: async (apiKey) => {
    return await ipcRenderer.invoke("test-audio", apiKey);
  },
  
  testSpeechWithFile: async (filePath, apiKey) => {
    return await ipcRenderer.invoke("test-speech-with-file", { filePath, apiKey });
  },
  
  // Add a listener for transcription events from audio recordings
  onRecordingTranscription: (callback) => {
    ipcRenderer.on("recording-transcription", (_, data) => {
      callback(data);
    });
  }
}); 