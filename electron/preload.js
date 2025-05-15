const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Expose methods to the renderer process
  platform: process.platform,
  isElectron: true,
  // Add application path for accessing resources
  appPath: process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, '..') 
    : process.cwd(),
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
      console.log('🔄 preload.js: Testing speech with file:', filePath);
      return await ipcRenderer.invoke('test-speech-with-file', filePath);
    } catch (error) {
      console.error('❌ preload.js: Error testing speech with file:', error);
      throw error;
    }
  },
  // Add method to save audio files to disk
  saveAudioFile: async (buffer, filename, formats = ['wav', 'mp3']) => {
    try {
      console.log('🔄 preload.js: Saving audio file with formats:', formats);
      return await ipcRenderer.invoke('save-audio-file', { buffer, filename, formats });
    } catch (error) {
      console.error('❌ preload.js: Error saving audio file:', error);
      throw error;
    }
  }
});

contextBridge.exposeInMainWorld(
  'api', {
    // New method for transcribing audio with API key
    transcribeAudioWithApiKey: async (audioBuffer) => {
      return await ipcRenderer.invoke('transcribe-audio', audioBuffer);
    },
  }
);

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]);
  }
});
