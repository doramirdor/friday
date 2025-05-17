import { contextBridge, ipcRenderer } from 'electron';

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
  saveAudioFile: async (buffer, filename, formats = ['wav']) => {
    try {
      console.log(`🔄 preload.js: Saving audio file ${filename}, buffer size: ${buffer.byteLength}, formats:`, formats);
      const result = await ipcRenderer.invoke('save-audio-file', { buffer, filename, formats });
      console.log(`📄 preload.js: Save result:`, result);
      return result;
    } catch (error) {
      console.error('❌ preload.js: Error saving audio file:', error);
      throw error;
    }
  },
  
  // Google Speech API methods
  invokeGoogleSpeech: async (audioBuffer, options = {}) => {
    try {
      console.log(`🔄 preload.js: Invoking Google Speech API with buffer size: ${audioBuffer.byteLength}, options:`, options);
      const result = await ipcRenderer.invoke('invoke-google-speech', audioBuffer, options);
      console.log(`📄 preload.js: Speech API result: ${result?.substring(0, 50)}${result?.length > 50 ? '...' : ''}`);
      return result;
    } catch (error) {
      console.error('❌ preload.js: Error invoking Google Speech API:', error);
      throw error;
    }
  },

  // Test speech with file
  testSpeechWithFile: async (filePath) => {
    try {
      console.log(`🔄 preload.js: Testing speech with file: ${filePath}`);
      const result = await ipcRenderer.invoke('test-speech-with-file', filePath);
      console.log(`📄 preload.js: Test result:`, result);
      return result;
    } catch (error) {
      console.error('❌ preload.js: Error testing speech with file:', error);
      throw error;
    }
  }
}); 