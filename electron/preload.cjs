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
  invokeGoogleSpeech: async (audioBuffer) => {
    try {
      return await ipcRenderer.invoke('invoke-google-speech', audioBuffer);
    } catch (error) {
      console.error('Error invoking Google Speech API:', error);
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