const { contextBridge, ipcRenderer } = require("electron");

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
  
  // File handling methods
  saveAudioFile: async (buffer, filename) => {
    try {
      return await ipcRenderer.invoke('save-audio-file', { buffer, filename });
    } catch (error) {
      console.error('Error saving audio file:', error);
      throw error;
    }
  },
  
  // Google Speech API methods
  invokeGoogleSpeech: async (audioBuffer) => {
    try {
      return await ipcRenderer.invoke('invoke-google-speech', audioBuffer);
    } catch (error) {
      console.error('Error invoking Google Speech API:', error);
      throw error;
    }
  }
}); 