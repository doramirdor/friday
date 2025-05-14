
const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// specific Electron APIs without exposing the entire API
contextBridge.exposeInMainWorld(
  'electron',
  {
    platform: process.platform,
    // Add any other functionality you want to expose to the renderer process
    recordDesktop: () => {
      // This is a placeholder for future desktop recording functionality
      console.log('Desktop recording requested - functionality to be implemented');
      return { success: true, message: 'Recording requested' };
    }
  }
);
