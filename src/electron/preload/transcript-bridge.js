const { contextBridge, ipcRenderer } = require('electron');

// Expose transcript-related methods to the renderer process
function exposeTranscriptAPI() {
  contextBridge.exposeInMainWorld('transcriptAPI', {
    // Save transcript to file
    saveTranscript: async (meetingId, transcript, speakerInfo) => {
      return await ipcRenderer.invoke('save-transcript', { 
        meetingId, 
        transcript, 
        speakerInfo 
      });
    },
    
    // Load transcript from file
    loadTranscript: async (filePath) => {
      return await ipcRenderer.invoke('load-transcript', filePath);
    },
    
    // Export transcript to different formats
    exportTranscript: async (data, format, outputPath) => {
      return await ipcRenderer.invoke('export-transcript', { 
        data, 
        format, 
        outputPath 
      });
    },
    
    // Register for transcript auto-save events
    onTranscriptUpdated: (callback) => {
      ipcRenderer.on('transcript-updated', (_, data) => {
        callback(data);
      });
    },
    
    // Register for transcript loading events
    onTranscriptLoaded: (callback) => {
      ipcRenderer.on('transcript-loaded', (_, data) => {
        callback(data);
      });
    },
    
    // Register for transcript export completion events
    onExportComplete: (callback) => {
      ipcRenderer.on('export-complete', (_, data) => {
        callback(data);
      });
    },
    
    // Update transcript in real-time (for auto-saving)
    updateTranscript: async (meetingId, transcript, speakerInfo) => {
      return await ipcRenderer.invoke('update-transcript', {
        meetingId,
        transcript,
        speakerInfo
      });
    },
    
    // Search through transcripts
    searchTranscripts: async (searchTerm) => {
      return await ipcRenderer.invoke('search-transcripts', searchTerm);
    },
    
    // Get list of available transcripts
    getTranscriptsList: async () => {
      return await ipcRenderer.invoke('get-transcripts-list');
    },
    
    // Delete a transcript
    deleteTranscript: async (filePath) => {
      return await ipcRenderer.invoke('delete-transcript', filePath);
    }
  });
}

module.exports = { exposeTranscriptAPI }; 