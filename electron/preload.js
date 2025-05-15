const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Expose methods to the renderer process
  platform: process.platform,
  isElectron: true,
  // Add more methods as needed
  sendMessage: (channel, data) => {
    // Whitelist channels that can be used
    const validChannels = ['to-main'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = ['from-main'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender` 
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  // Add Google Speech API invocation method
  invokeGoogleSpeech: async (audioBuffer, options = {}) => {
    try {
      console.log('🔄 preload.js: Invoking Google Speech API with options:', {
        bufferSize: audioBuffer.byteLength,
        options: JSON.stringify(options)
      });
      const result = await ipcRenderer.invoke('invoke-google-speech', audioBuffer, options);
      console.log('📥 preload.js: Received response from main process:', { 
        resultLength: result?.length,
        resultPreview: result?.substring(0, 50) + (result?.length > 50 ? '...' : '')
      });
      return result;
    } catch (error) {
      console.error('❌ preload.js: Error invoking Google Speech API:', error);
      throw error;
    }
  },
  // Add method to select credentials file
  selectCredentialsFile: async () => {
    try {
      return await ipcRenderer.invoke('select-credentials-file');
    } catch (error) {
      console.error('Error selecting credentials file:', error);
      throw error;
    }
  },
  // Add method to test speech recognition with existing audio files
  testSpeechWithFile: async (filePath) => {
    try {
      return await ipcRenderer.invoke('test-speech-with-file', filePath);
    } catch (error) {
      console.error('Error testing speech with file:', error);
      throw error;
    }
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]);
  }
});
