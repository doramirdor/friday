import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

// Handler for transcript-related functionality in the main process
export function setupTranscriptHandlers() {
  // Save transcript to file
  ipcMain.handle('save-transcript', async (event, { meetingId, transcript, speakerInfo }) => {
    try {
      // Generate a unique filename based on meetingId
      const filename = `transcript_${meetingId}_${Date.now()}.json`;
      const documentsPath = app.getPath('documents');
      const savePath = path.join(documentsPath, 'Friday Transcripts');
      
      // Ensure directory exists
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }
      
      // Combine transcript data with speaker info
      const transcriptData = {
        meetingId,
        timestamp: new Date().toISOString(),
        transcript,
        speakers: speakerInfo
      };
      
      // Write to file
      const filePath = path.join(savePath, filename);
      fs.writeFileSync(filePath, JSON.stringify(transcriptData, null, 2));
      
      return {
        success: true,
        filePath
      };
    } catch (error) {
      console.error('Error saving transcript:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });
  
  // Load transcript from file
  ipcMain.handle('load-transcript', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'Transcript file not found'
        };
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const transcriptData = JSON.parse(fileContent);
      
      return {
        success: true,
        data: transcriptData
      };
    } catch (error) {
      console.error('Error loading transcript:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });
  
  // Export transcript to different formats
  ipcMain.handle('export-transcript', async (event, { data, format, outputPath }) => {
    try {
      let result;
      
      switch (format) {
        case 'txt':
          // Export as plain text
          result = exportToPlainText(data, outputPath);
          break;
        case 'docx':
          // Export as Word document
          result = exportToDocx(data, outputPath);
          break;
        case 'md':
          // Export as markdown
          result = exportToMarkdown(data, outputPath);
          break;
        default:
          // Default to JSON
          result = exportToJson(data, outputPath);
      }
      
      return result;
    } catch (error) {
      console.error(`Error exporting transcript to ${format}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  });
}

// Helper functions for exporting transcripts
function exportToPlainText(data, outputPath) {
  try {
    // Format transcript as plain text
    let textContent = `TRANSCRIPT: ${data.meetingId}\n`;
    textContent += `Date: ${new Date(data.timestamp).toLocaleString()}\n\n`;
    
    data.transcript.forEach(line => {
      const speaker = data.speakers.find(s => s.id === line.speakerId);
      const speakerName = speaker ? speaker.name : 'Unknown';
      textContent += `${speakerName}: ${line.text}\n`;
    });
    
    // Write to file
    fs.writeFileSync(outputPath, textContent);
    
    return {
      success: true,
      filePath: outputPath
    };
  } catch (error) {
    console.error('Error exporting to text:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function exportToJson(data, outputPath) {
  try {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    return {
      success: true,
      filePath: outputPath
    };
  } catch (error) {
    console.error('Error exporting to JSON:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function exportToMarkdown(data, outputPath) {
  try {
    // Format transcript as markdown
    let mdContent = `# Transcript: ${data.meetingId}\n\n`;
    mdContent += `*Date: ${new Date(data.timestamp).toLocaleString()}*\n\n`;
    
    // Add speaker information
    mdContent += "## Speakers\n\n";
    data.speakers.forEach(speaker => {
      mdContent += `- **${speaker.name}**\n`;
    });
    
    mdContent += "\n## Transcript\n\n";
    
    data.transcript.forEach(line => {
      const speaker = data.speakers.find(s => s.id === line.speakerId);
      const speakerName = speaker ? speaker.name : 'Unknown';
      mdContent += `**${speakerName}**: ${line.text}\n\n`;
    });
    
    // Write to file
    fs.writeFileSync(outputPath, mdContent);
    
    return {
      success: true,
      filePath: outputPath
    };
  } catch (error) {
    console.error('Error exporting to markdown:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function exportToDocx(data, outputPath) {
  // This would require a library like docx.js
  // For this example, we'll just show a placeholder implementation
  return {
    success: false,
    error: 'DOCX export not implemented yet'
  };
} 