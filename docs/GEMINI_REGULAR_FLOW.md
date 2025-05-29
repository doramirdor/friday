# Gemini Regular Transcription Flow

This document outlines the complete method call flow for regular Gemini transcription when you have a completed recording and want to transcribe it using Gemini AI with speaker diarization.

## Overview

The regular Gemini transcription flow takes a completed audio file (from recording or file upload) and sends it to Gemini AI for transcription with speaker identification. This uses the Gemini 2.0 Flash model with file upload capabilities.

## Architecture Components

- **Frontend**: TranscriptDetails React component
- **Service Layer**: Gemini service with transcribeAudio method
- **Electron Main Process**: File reading and audio handling
- **Gemini AI**: Google's Generative AI with file upload and transcription capabilities

---

## Complete Method Call Flow

### 1. User-Initiated Transcription

#### User Interface Action (TranscriptDetails.tsx)
```javascript
// 1. User clicks "Gemini 2.5" transcription button
<Button onClick={handleGeminiTranscribe}>
  Gemini 2.5
</Button>
```

#### Component Handler (TranscriptDetails.tsx)
```javascript
// 2. handleGeminiTranscribe() method triggered
const handleGeminiTranscribe = useCallback(async () => {
  // 3. Validate audio file availability
  if (!recordedAudioUrl) {
    toast.error('No audio file available to transcribe');
    return;
  }

  // 4. Check Gemini service availability
  if (!geminiService.isAvailable()) {
    toast.error('Gemini AI is not configured. Please add your API key in settings.');
    return;
  }

  // 5. Show loading toast
  toast.loading('Transcribing with Gemini 2.5. This may take a while for longer recordings...', { 
    id: 'gemini-transcribing',
    duration: 15000
  });

  // 6. Call Gemini service
  const result = await geminiService.transcribeAudio(recordedAudioUrl, maxSpeakers);
  
  // 7. Process results (detailed later)
  // ...
}, [recordedAudioUrl, maxSpeakers]);
```

---

### 2. Gemini Service Initialization

#### Service Availability Check (gemini.ts)
```javascript
// 8. geminiService.isAvailable() method
isAvailable(): boolean {
  // 9. Check if API is initialized and has API key
  return !!this.genAI;
}
```

#### Service Initialization (gemini.ts)
```javascript
// 10. GeminiService constructor
constructor() {
  // 11. Initialize with API key from environment or settings
  this.initializeAPI();
}

// 12. initializeAPI() method
private async initializeAPI(): Promise<void> {
  // 13. Get API key from Electron environment
  const electronAPI = (window as any).electronAPI;
  const envApiKey = electronAPI?.env?.GEMINI_API_KEY;
  
  // 14. Fallback to database settings
  let apiKey = envApiKey;
  if (!apiKey) {
    try {
      const settings = await DatabaseService.getSettings();
      apiKey = settings?.geminiApiKey;
    } catch (error) {
      console.warn('Failed to load Gemini API key from database:', error);
    }
  }

  // 15. Initialize GoogleGenAI client
  if (apiKey) {
    this.genAI = new GoogleGenAI(apiKey);
  }
}
```

---

### 3. Audio File Processing Phase

#### Transcription Method Entry (gemini.ts)
```javascript
// 16. geminiService.transcribeAudio() method
async transcribeAudio(audioFile: File | string, maxSpeakers: number = 4): Promise<GeminiTranscriptionResult> {
  // 17. Validate Gemini AI initialization
  if (!this.genAI) {
    throw new Error('Gemini AI is not initialized. Please check your API key.');
  }

  // 18. Log transcription start
  console.log('Starting Gemini audio transcription...', { 
    audioFile: typeof audioFile === 'string' ? audioFile : 'File object', 
    maxSpeakers 
  });

  let uploadedFile;
  
  // 19. Handle different audio file types
  if (typeof audioFile === 'string') {
    uploadedFile = await this.handleStringAudioInput(audioFile);
  } else {
    uploadedFile = await this.handleFileObjectInput(audioFile);
  }

  // 20. Continue to transcription processing
  // ...
}
```

#### String Audio Input Processing (gemini.ts)
```javascript
// 21. handleStringAudioInput() method (for file paths, data URLs, blob URLs)
private async handleStringAudioInput(audioFile: string) {
  // 22. Check if it's a data URL or blob URL
  if (audioFile.startsWith('data:') || audioFile.startsWith('blob:')) {
    return await this.handleDataUrlInput(audioFile);
  } else {
    return await this.handleFilePathInput(audioFile);
  }
}

// 23. handleDataUrlInput() method
private async handleDataUrlInput(audioFile: string) {
  console.log('Converting data/blob URL to File object');
  
  try {
    // 24. Fetch the data/blob URL
    const response = await fetch(audioFile);
    const blob = await response.blob();
    const file = new File([blob], 'audio.mp3', { type: 'audio/mp3' });
    
    // 25. Upload to Gemini
    const uploadedFile = await this.genAI.files.upload({
      file: file,
      config: { mimeType: 'audio/mp3' }
    });
    
    return uploadedFile;
  } catch (fetchError) {
    throw new Error(`Failed to process audio URL: ${fetchError.message}`);
  }
}
```

#### File Path Input Processing (gemini.ts)
```javascript
// 26. handleFilePathInput() method (for local file paths)
private async handleFilePathInput(audioFile: string) {
  // 27. Get Electron API for file reading
  const electronAPI = (window as { 
    electronAPI?: { 
      readAudioFile?: (path: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>; 
      checkFileExists?: (path: string) => Promise<boolean> 
    } 
  }).electronAPI;
  
  // 28. Validate Electron API availability
  if (!electronAPI?.readAudioFile) {
    throw new Error('File reading not available in this environment');
  }

  // 29. Check if file exists
  if (electronAPI?.checkFileExists) {
    const fileExists = await electronAPI.checkFileExists(audioFile);
    if (!fileExists) {
      throw new Error(`Audio file not found or is empty: ${audioFile}`);
    }
  }

  // 30. Read audio file via Electron
  const audioData = await electronAPI.readAudioFile(audioFile);
  
  // 31. Handle read result
  if (!audioData.success) {
    throw new Error(`Failed to read audio file: ${audioData.error || 'Unknown error'}`);
  }

  console.log('Audio file read successfully, size:', audioData.buffer?.byteLength || 'unknown');

  // 32. Convert to Blob and upload
  const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });
  const uploadedFile = await this.genAI.files.upload({
    file: audioBlob,
    config: { mimeType: 'audio/mp3' }
  });

  return uploadedFile;
}
```

---

### 4. Electron File Reading Phase

#### IPC Handler (main/index.js)
```javascript
// 33. IPC Handler: readAudioFile
ipcMain.handle("readAudioFile", async (event, filepath) => {
  try {
    console.log(`🔄 main.js: Reading audio file for Gemini: ${filepath}`);
    
    // 34. Check file existence
    if (!fs.existsSync(filepath)) {
      console.error(`❌ main.js: Audio file not found: ${filepath}`);
      return { success: false, error: "File not found" };
    }
    
    // 35. Get file size statistics
    const stats = fs.statSync(filepath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`📊 main.js: Audio file size: ${fileSizeMB.toFixed(2)} MB`);
    
    // 36. Check file size limit (Gemini 20MB limit)
    if (fileSizeMB > 20) {
      console.log(`⚠️ main.js: File is too large (${fileSizeMB.toFixed(2)} MB) for Gemini transcription`);
      return { 
        success: false, 
        error: `File too large for Gemini transcription (${fileSizeMB.toFixed(2)} MB). Maximum size is 20MB.`
      };
    }
    
    // 37. Read the audio file as buffer
    const buffer = fs.readFileSync(filepath);
    console.log(`✅ main.js: Read audio file: ${buffer.length} bytes`);
    
    // 38. Return successful result
    return {
      success: true,
      buffer: buffer,
      fileSizeMB: fileSizeMB
    };
  } catch (error) {
    console.error(`❌ main.js: Error reading audio file: ${error.message}`);
    return { 
      success: false,
      error: error.message
    };
  }
});
```

---

### 5. Gemini AI Transcription Phase

#### File Upload and Processing (gemini.ts)
```javascript
// 39. Continue transcribeAudio() after file upload
async transcribeAudio(audioFile: File | string, maxSpeakers: number = 4): Promise<GeminiTranscriptionResult> {
  // ... (previous file handling steps)
  
  console.log('Audio file uploaded to Gemini, generating transcription...');

  // 40. Create transcription prompt
  const prompt = `Please provide a detailed transcription of this audio with speaker diarization. 

Requirements:
1. Identify different speakers and label them as "Speaker 1", "Speaker 2", etc.
2. Limit the number of speakers to a maximum of ${maxSpeakers} speakers
3. If you detect more than ${maxSpeakers} different voices, group similar voices together rather than creating new speakers
4. Format the output with each speaker's dialogue on separate lines
5. Use the format: "Speaker X: [dialogue]"
6. If you can detect speaker changes within a single turn, break them into separate lines
7. Maintain chronological order of the conversation
8. Include all speech content, even brief interjections

Please provide the transcription:`;

  // 41. Call Gemini AI with file and prompt
  const result = await this.genAI.models.generateContent({
    model: 'gemini-2.0-flash-001',
    contents: [
      prompt,
      {
        fileData: {
          mimeType: uploadedFile.mimeType,
          fileUri: uploadedFile.uri
        }
      }
    ]
  });

  // 42. Extract transcription text
  const transcriptionText = result.text;
  console.log('Gemini transcription received:', transcriptionText);

  // 43. Parse transcription and extract speakers
  const { transcript, speakers } = await this.parseTranscriptionWithSpeakers(transcriptionText, maxSpeakers);

  // 44. Cleanup uploaded file from Gemini
  try {
    await this.genAI.files.delete(uploadedFile.name);
  } catch (cleanupError) {
    console.warn('Failed to cleanup uploaded file:', cleanupError);
  }

  // 45. Return structured result
  return {
    transcript,
    speakers
  };
}
```

---

### 6. Transcription Parsing Phase

#### Speaker and Text Parsing (gemini.ts)
```javascript
// 46. parseTranscriptionWithSpeakers() method
private async parseTranscriptionWithSpeakers(transcriptionText: string, maxSpeakers: number): Promise<{ transcript: string, speakers: Speaker[] }> {
  // 47. Split transcription into lines
  const lines = transcriptionText.split('\n').filter(line => line.trim());
  const speakerMap = new Map<string, Speaker>();
  const transcriptLines: string[] = [];
  
  // 48. Define speaker colors
  const speakerColors = ['#28C76F', '#7367F0', '#FF9F43', '#EA5455', '#00CFE8', '#9F44D3'];
  let colorIndex = 0;

  // 49. Process each line for speaker detection
  for (const line of lines) {
    // 50. Match speaker patterns like "Speaker 1:", "Speaker 2:", etc.
    const speakerMatch = line.match(/^(Speaker\s+(\d+)):\s*(.+)$/i);
    
    if (speakerMatch) {
      const speakerLabel = speakerMatch[1];
      const speakerNumber = speakerMatch[2];
      const dialogue = speakerMatch[3].trim();
      
      // 51. Create speaker if not exists and within limit
      if (!speakerMap.has(speakerNumber)) {
        if (speakerMap.size < maxSpeakers) {
          speakerMap.set(speakerNumber, {
            id: speakerNumber,
            meetingId: '', // Will be set when used
            name: speakerLabel,
            color: speakerColors[colorIndex % speakerColors.length],
            type: 'speaker'
          });
          colorIndex++;
        } else {
          // 52. If speaker limit reached, assign to last speaker
          const lastSpeakerId = Array.from(speakerMap.keys())[speakerMap.size - 1];
          const lastSpeaker = speakerMap.get(lastSpeakerId);
          if (lastSpeaker) {
            transcriptLines.push(`${lastSpeaker.name}: ${dialogue}`);
            continue;
          }
        }
      }
      
      // 53. Add formatted line to transcript
      transcriptLines.push(`${speakerLabel}: ${dialogue}`);
    } else if (line.trim()) {
      // 54. Add non-speaker lines as-is
      transcriptLines.push(line.trim());
    }
  }

  // 55. Handle case where no speakers were detected
  if (speakerMap.size === 0) {
    speakerMap.set('1', {
      id: '1',
      meetingId: '',
      name: 'Speaker 1',
      color: speakerColors[0],
      type: 'speaker'
    });
    
    // 56. Format entire transcription under Speaker 1
    const formattedTranscript = transcriptLines.length > 0 
      ? `Speaker 1: ${transcriptLines.join(' ')}`
      : `Speaker 1: ${transcriptionText}`;
    
    return {
      transcript: formattedTranscript,
      speakers: Array.from(speakerMap.values())
    };
  }

  // 57. Return parsed results
  return {
    transcript: transcriptLines.join('\n'),
    speakers: Array.from(speakerMap.values())
  };
}
```

---

### 7. Result Processing Phase

#### Component Result Handling (TranscriptDetails.tsx)
```javascript
// 58. Continue handleGeminiTranscribe() after service call
const handleGeminiTranscribe = useCallback(async () => {
  // ... (previous validation and service call)
  
  // 59. Process successful transcription result
  if (result && result.transcript) {
    // 60. Parse transcript into individual lines
    const lines = result.transcript.split('\n').filter(line => line.trim());
    const newTranscriptLines: TranscriptLine[] = [];
    
    // 61. Update speakers if new ones were detected
    if (result.speakers && result.speakers.length > 0) {
      const updatedSpeakers = result.speakers.map(speaker => ({
        ...speaker,
        meetingId: meetingId || ''
      }));
      setSpeakers(updatedSpeakers);
    }
    
    // 62. Process each transcript line
    lines.forEach((line, index) => {
      // 63. Extract speaker and text from each line
      const speakerMatch = line.match(/^(Speaker\s+\d+):\s*(.+)$/i);
      
      if (speakerMatch) {
        const speakerName = speakerMatch[1];
        const text = speakerMatch[2].trim();
        
        // 64. Find corresponding speaker ID
        const speaker = result.speakers?.find(s => s.name === speakerName);
        const speakerId = speaker?.id || '1';
        
        // 65. Create transcript line object
        newTranscriptLines.push({
          id: `gemini-${Date.now()}-${index}`,
          text: text,
          speakerId: speakerId,
        });
      } else if (line.trim()) {
        // 66. Handle lines without speaker patterns
        newTranscriptLines.push({
          id: `gemini-${Date.now()}-${index}`,
          text: line.trim(),
          speakerId: '1',
        });
      }
    });
    
    // 67. Update component state with new transcript lines
    setTranscriptLines(newTranscriptLines);
    
    // 68. Show success notification
    toast.success('Audio transcribed successfully with Gemini AI!', { 
      id: 'gemini-transcribing' 
    });
    
  } else {
    // 69. Handle case where no transcription was received
    toast.error('No transcription received from Gemini', { id: 'gemini-transcribing' });
  }
}, [recordedAudioUrl, maxSpeakers, meetingId]);
```

---

### 8. State Management and UI Updates

#### Transcript Lines State Update
```javascript
// 70. setTranscriptLines() triggers React re-render
setTranscriptLines(newTranscriptLines);

// 71. Component re-renders with new transcript data
{transcriptLines.map((line) => {
  const speaker = speakers.find(s => s.id === line.speakerId);
  return (
    <div key={line.id} className="transcript-line">
      {/* 72. Display speaker name and text */}
      <span className="speaker-name">{speaker?.name}</span>
      <span className="transcript-text">{line.text}</span>
    </div>
  );
})}
```

#### Speakers State Update
```javascript
// 73. setSpeakers() updates speaker list
setSpeakers(updatedSpeakers);

// 74. Speakers tab shows updated speaker information
{speakers.map((speaker) => (
  <div key={speaker.id} className="speaker-item">
    {/* 75. Display speaker with color indicator */}
    <div className="speaker-color" style={{ backgroundColor: speaker.color }} />
    <span className="speaker-name">{speaker.name}</span>
    <span className="speaker-id">ID: {speaker.id}</span>
  </div>
))}
```

---

### 9. Error Handling Flow

#### Service-Level Error Handling (gemini.ts)
```javascript
// 76. transcribeAudio() error handling
async transcribeAudio(audioFile: File | string, maxSpeakers: number = 4): Promise<GeminiTranscriptionResult> {
  try {
    // ... (main transcription logic)
  } catch (error) {
    console.error('Error transcribing audio with Gemini:', error);
    
    // 77. Throw structured error message
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}
```

#### Component-Level Error Handling (TranscriptDetails.tsx)
```javascript
// 78. handleGeminiTranscribe() error handling
const handleGeminiTranscribe = useCallback(async () => {
  try {
    // ... (main transcription logic)
  } catch (error) {
    console.error('Error transcribing audio with Gemini:', error);
    
    // 79. Provide specific error messages
    let errorMessage = 'Failed to transcribe audio with Gemini';
    if (error instanceof Error) {
      if (error.message.includes('File not found')) {
        errorMessage = 'Audio file not found. Please check if the recording file exists.';
      } else if (error.message.includes('Failed to read audio file')) {
        errorMessage = 'Could not read the audio file. The file may be corrupted or in an unsupported format.';
      } else if (error.message.includes('File reading not available')) {
        errorMessage = 'File reading is not available in this environment.';
      } else if (error.message.includes('API key')) {
        errorMessage = 'Gemini API key is not configured. Please add your API key in settings.';
      } else {
        errorMessage = `Transcription failed: ${error.message}`;
      }
    }
    
    // 80. Show error notification
    toast.error(errorMessage, { id: 'gemini-transcribing' });
  }
}, [recordedAudioUrl, maxSpeakers]);
```

---

## Key Features

### Gemini AI Integration
- **Latest Model**: Uses Gemini 2.0 Flash for high-quality transcription
- **File Upload**: Supports large audio files up to 20MB
- **Speaker Diarization**: Automatic speaker identification and labeling
- **Configurable Speakers**: Adjustable maximum speaker count per meeting

### File Format Support
- **Multiple Inputs**: Handles File objects, file paths, data URLs, and blob URLs
- **Format Flexibility**: Supports MP3, WAV, and other audio formats
- **Size Validation**: Checks file size limits before processing
- **Error Recovery**: Graceful handling of file read failures

### Audio File Processing
- **Electron Integration**: Secure file reading through IPC
- **Buffer Management**: Efficient handling of large audio buffers
- **File Validation**: Existence and size checks before processing
- **Cleanup**: Automatic cleanup of uploaded files from Gemini

### Transcription Quality
- **Detailed Prompts**: Comprehensive instructions for optimal results
- **Speaker Limits**: Prevents over-segmentation with configurable limits
- **Format Consistency**: Standardized "Speaker X: dialogue" format
- **Content Preservation**: Includes all speech content and interjections

### Error Handling
- **Comprehensive Coverage**: Error handling at every processing stage
- **User-Friendly Messages**: Clear, actionable error descriptions
- **Graceful Degradation**: Continues operation when possible
- **Detailed Logging**: Extensive logging for debugging and monitoring 