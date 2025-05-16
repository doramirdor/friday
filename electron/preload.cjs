const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Expose methods to the renderer process
  platform: process.platform,
  isElectron: true,
  // Simplify appPath to avoid using path module
  appPath: process.env.NODE_ENV === 'production' 
    ? '../' // Relative path from preload script to app root in production
    : process.cwd(), // Current working directory in development
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
      console.log('🔄 preload.cjs: Invoking Google Speech API with options:', {
        bufferSize: audioBuffer.byteLength,
        options: JSON.stringify(options)
      });
      const result = await ipcRenderer.invoke('invoke-google-speech', audioBuffer, options);
      console.log('📥 preload.cjs: Received response from main process:', { 
        resultLength: result?.length,
        resultPreview: result?.substring(0, 50) + (result?.length > 50 ? '...' : '')
      });
      return result;
    } catch (error) {
      console.error('❌ preload.cjs: Error invoking Google Speech API:', error);
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
      console.log('🔄 preload.cjs: Testing speech with file:', filePath);
      return await ipcRenderer.invoke('test-speech-with-file', filePath);
    } catch (error) {
      console.error('❌ preload.cjs: Error testing speech with file:', error);
      throw error;
    }
  },
  // Add method to save audio files to disk
  saveAudioFile: async (buffer, filename, formats = ['wav', 'mp3']) => {
    try {
      console.log('🔄 preload.cjs: Saving audio file with formats:', formats);
      return await ipcRenderer.invoke('save-audio-file', { buffer, filename, formats });
    } catch (error) {
      console.error('❌ preload.cjs: Error saving audio file:', error);
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