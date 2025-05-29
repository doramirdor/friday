# Gemini Semi-Live Transcription Flow

This document outlines the complete method call flow for the Gemini Semi-Live transcription system, which uses a file-based approach with 1-second audio chunks for near real-time transcription.

## Overview

The Gemini Semi-Live system captures audio in real-time, saves it as temporary WAV files, and uses the proven `testSpeechWithFile` Electron API to transcribe each chunk. This approach leverages existing stable transcription tools instead of complex memory buffering.

## Architecture Components

- **Frontend**: React component + hook
- **Service Layer**: File-based semi-live service
- **Electron Main Process**: IPC handlers for file operations and transcription
- **Transcription Engine**: Google Cloud Speech-to-Text API

---

## Complete Method Call Flow

### 1. Initialization Phase

#### Frontend Component (TranscriptDetails.tsx)
```javascript
// 1. Component imports and initializes hook
import { useGeminiSemiLive } from '@/hooks/useGeminiSemiLive';

// 2. Hook initialization
const geminiLive = useGeminiSemiLive();
```

#### Hook Initialization (useGeminiSemiLive.tsx)
```javascript
// 3. Hook creates service instance
const [service] = useState(() => geminiSemiLiveService);

// 4. Service availability check
const isServiceAvailable = service.isAvailable;
```

#### Service Initialization (gemini-semi-live.ts)
```javascript
// 5. LegacyAdapter creates FileSemiLiveService
class LegacyAdapter {
  private fileService = new FileSemiLiveService();
  
  get isAvailable(): boolean {
    return this.fileService.isAvailable;
  }
}

// 6. FileSemiLiveService checks Electron APIs
get isAvailable(): boolean {
  return !!(window as any).electronAPI?.saveAudioFile && 
         !!(window as any).electronAPI?.testSpeechWithFile;
}
```

---

### 2. Recording Start Phase

#### User Interface Action
```javascript
// 7. User clicks start recording button
const handleStartRecording = () => {
  geminiLive.startRecording(options);
}
```

#### Hook Processing (useGeminiSemiLive.tsx)
```javascript
// 8. Hook calls service startRecording
const startRecording = useCallback(async (options) => {
  if (!service.isAvailable) return false;
  
  const success = await service.startRecording({
    chunkDurationMs: 1000,
    processingMode: 'continuous',
    enableSpeakerDiarization: true,
    maxSpeakers: 4,
    ...options
  });
  
  return success;
}, [service]);
```

#### Service Layer (gemini-semi-live.ts)
```javascript
// 9. LegacyAdapter forwards to FileSemiLiveService
async startRecording(options: GeminiSemiLiveOptions): Promise<boolean> {
  return this.fileService.startRecording(options);
}

// 10. FileSemiLiveService.startRecording() method
async startRecording(options: FileSemiLiveOptions): Promise<boolean> {
  // 11. Initialize state
  this.state.isRecording = true;
  this.state.processingMode = options.processingMode || 'send-at-end';
  this.state.chunkDurationMs = options.chunkDurationMs || 1000;
  
  // 12. Start microphone capture
  const success = await this.startMicrophoneCapture(options);
  
  // 13. Setup processing interval (if continuous mode)
  if (this.state.processingMode === 'continuous') {
    this.setupAudioProcessingInterval();
  }
  
  return success;
}
```

#### Audio Capture Setup (gemini-semi-live.ts)
```javascript
// 14. FileSemiLiveService.startMicrophoneCapture()
private async startMicrophoneCapture(options: FileSemiLiveOptions): Promise<boolean> {
  // 15. Get microphone permission
  this.mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: 16000, channelCount: 1 }
  });
  
  // 16. Create audio context
  this.audioContext = new AudioContext({ sampleRate: 16000 });
  
  // 17. Setup audio processing chain
  const source = this.audioContext.createMediaStreamSource(this.mediaStream);
  this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
  
  // 18. Connect audio processing pipeline
  source.connect(this.gainNode);
  this.gainNode.connect(this.scriptProcessor);
  this.scriptProcessor.connect(this.audioContext.destination);
  
  // 19. Setup audio data handler
  this.scriptProcessor.onaudioprocess = (event) => {
    this.handleAudioData(event);
  };
  
  return true;
}
```

#### Audio Processing Interval (gemini-semi-live.ts)
```javascript
// 20. FileSemiLiveService.setupAudioProcessingInterval()
private setupAudioProcessingInterval(): void {
  this.processingInterval = window.setInterval(() => {
    this.processAudioBuffer();
  }, this.state.chunkDurationMs);
}
```

---

### 3. Real-Time Audio Processing Phase

#### Audio Data Capture (gemini-semi-live.ts)
```javascript
// 21. FileSemiLiveService.handleAudioData() - called every 4096 samples
private handleAudioData(event: AudioProcessingEvent): void {
  const inputData = event.inputBuffer.getChannelData(0);
  
  // 22. Add to buffer
  this.audioBuffer.push(new Float32Array(inputData));
}
```

#### Periodic Processing (every 1 second in continuous mode)
```javascript
// 23. FileSemiLiveService.processAudioBuffer() - called by interval
private async processAudioBuffer(): Promise<void> {
  if (this.audioBuffer.length === 0) return;
  
  // 24. Combine audio chunks
  const combinedBuffer = this.combineAudioBuffer();
  
  // 25. Convert to WAV format
  const wavBuffer = this.createWavFile(combinedBuffer, 16000);
  
  // 26. Save as temporary file
  const tempFilePath = await this.saveTemporaryFile(wavBuffer);
  
  // 27. Add to processing queue
  this.state.audioChunks.push({
    filePath: tempFilePath,
    timestamp: Date.now(),
    duration: combinedBuffer.length / 16000
  });
  
  // 28. Process immediately (continuous mode)
  if (this.state.processingMode === 'continuous') {
    await this.processLatestChunk();
  }
  
  // 29. Clear buffer for next chunk
  this.audioBuffer = [];
}
```

#### File Operations (gemini-semi-live.ts)
```javascript
// 30. FileSemiLiveService.saveTemporaryFile()
private async saveTemporaryFile(wavBuffer: ArrayBuffer): Promise<string> {
  const electronAPI = (window as any).electronAPI;
  
  // 31. Call Electron saveAudioFile API
  const result = await electronAPI.saveAudioFile(
    wavBuffer,
    `chunk_${Date.now()}_${this.state.tempFileCounter++}.wav`,
    ['wav']
  );
  
  return result.filePath;
}
```

#### Electron Main Process (main/index.js)
```javascript
// 32. IPC Handler: saveAudioFile
ipcMain.handle("saveAudioFile", async (event, buffer, filename, formats) => {
  // 33. Create file in recordings directory
  const filePath = path.join(recordingsDir, filename);
  
  // 34. Write buffer to disk
  fs.writeFileSync(filePath, Buffer.from(buffer));
  
  return { success: true, filePath };
});
```

---

### 4. Transcription Processing Phase

#### Chunk Processing (gemini-semi-live.ts)
```javascript
// 35. FileSemiLiveService.processLatestChunk()
private async processLatestChunk(): Promise<void> {
  const latestChunk = this.state.audioChunks[this.state.audioChunks.length - 1];
  await this.processChunk(latestChunk);
}

// 36. FileSemiLiveService.processChunk()
private async processChunk(chunk: AudioChunk): Promise<void> {
  const electronAPI = (window as any).electronAPI;
  
  // 37. Call Electron testSpeechWithFile API
  const result = await electronAPI.testSpeechWithFile(chunk.filePath);
  
  // 38. Handle transcription result
  if (result.transcription) {
    this.handleTranscriptionResult(result, chunk);
  }
  
  // 39. Cleanup temporary file
  await this.cleanupFile(chunk.filePath);
}
```

#### Electron Main Process Transcription (main/index.js)
```javascript
// 40. IPC Handler: testSpeechWithFile
ipcMain.handle('test-speech-with-file', async (event, filePath) => {
  // 41. Read audio file
  const audioBuffer = fs.readFileSync(filePath);
  
  // 42. Determine if file needs chunking (>10MB)
  const isLongAudio = audioBuffer.length > MAX_SIZE;
  
  // 43. Process with appropriate handler
  if (isLongAudio) {
    transcription = await handleLongAudioTranscription(audioBuffer, 'WAV', options);
  } else {
    transcription = await handleGoogleSpeechAPI(audioBuffer, options);
  }
  
  return { transcription };
});
```

#### Google Speech API Processing (main/index.js)
```javascript
// 44. handleGoogleSpeechAPI()
async function handleGoogleSpeechAPI(audioBuffer, options) {
  // 45. Create Google Speech client
  const client = new speech.SpeechClient({
    apiKey: process.env.GOOGLE_SPEECH_API_KEY
  });
  
  // 46. Configure recognition request
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US',
    enableSpeakerDiarization: true,
    diarizationConfig: {
      enableSpeakerDiarization: true,
      maxSpeakerCount: 4
    }
  };
  
  // 47. Convert audio to base64
  const audioContent = audioBuffer.toString('base64');
  
  // 48. Send to Google Speech API
  const [response] = await client.recognize({
    config,
    audio: { content: audioContent }
  });
  
  // 49. Process results with speaker diarization
  return processTranscriptionResults(response);
}
```

---

### 5. Result Processing Phase

#### Result Handling (gemini-semi-live.ts)
```javascript
// 50. FileSemiLiveService.handleTranscriptionResult()
private handleTranscriptionResult(result: any, chunk: AudioChunk): void {
  // 51. Create result object
  const transcriptionResult: FileSemiLiveResult = {
    transcript: result.transcription,
    isFinal: true,
    speakers: result.speakers || [],
    timestamp: chunk.timestamp
  };
  
  // 52. Emit result to callback
  this.emitResult(transcriptionResult);
}

// 53. FileSemiLiveService.emitResult()
private emitResult(result: FileSemiLiveResult): void {
  if (this.resultCallback) {
    this.resultCallback(result);
  }
}
```

#### Hook Result Processing (useGeminiSemiLive.tsx)
```javascript
// 54. Hook registers result callback
useEffect(() => {
  if (service) {
    service.onResult((result) => {
      // 55. Update transcript state
      setTranscript(prev => prev + '\n' + result.transcript);
      
      // 56. Update speakers
      if (result.speakers) {
        setSpeakers(result.speakers);
      }
      
      // 57. Emit to parent component
      onTranscriptResult?.(result);
    });
  }
}, [service]);
```

#### Component Integration (TranscriptDetails.tsx)
```javascript
// 58. Component receives transcription result
const handleAddGeminiTranscript = useCallback((transcript: string) => {
  // 59. Parse transcript into lines
  const lines = transcript.split('\n').filter(line => line.trim());
  const newTranscriptLines: TranscriptLine[] = [];
  
  // 60. Process each line for speakers
  lines.forEach((line, index) => {
    const speakerMatch = line.match(/^\*\*Speaker (\d+)\*\*:\s*(.+)$/);
    
    if (speakerMatch) {
      // 61. Create/find speaker
      const speakerId = speakerMatch[1];
      const text = speakerMatch[2].trim();
      
      // 62. Add transcript line
      newTranscriptLines.push({
        id: `gemini-live-${Date.now()}-${index}`,
        text: text,
        speakerId: speakerId,
      });
    }
  });
  
  // 63. Update transcript lines state
  setTranscriptLines(prev => [...prev, ...newTranscriptLines]);
}, []);
```

---

### 6. Recording Stop Phase

#### Stop Recording (gemini-semi-live.ts)
```javascript
// 64. FileSemiLiveService.stopRecording()
async stopRecording(): Promise<FileSemiLiveResult[]> {
  // 65. Set recording state
  this.state.isRecording = false;
  
  // 66. Clear processing interval
  if (this.processingInterval) {
    clearInterval(this.processingInterval);
  }
  
  // 67. Process remaining audio buffer
  if (this.audioBuffer.length > 0) {
    await this.processAudioBuffer();
  }
  
  // 68. Process accumulated files (send-at-end mode)
  if (this.state.processingMode === 'send-at-end') {
    results = await this.processAccumulatedAudioFiles();
  }
  
  // 69. Cleanup all temporary files
  await this.cleanupTempFiles();
  
  // 70. Cleanup audio resources
  this.cleanupAudioResources();
  
  return results;
}
```

#### Resource Cleanup (gemini-semi-live.ts)
```javascript
// 71. FileSemiLiveService.cleanupAudioResources()
private cleanupAudioResources(): void {
  // 72. Disconnect audio nodes
  if (this.scriptProcessor) {
    this.scriptProcessor.disconnect();
  }
  
  // 73. Close audio context
  if (this.audioContext) {
    this.audioContext.close();
  }
  
  // 74. Stop media stream tracks
  if (this.mediaStream) {
    this.mediaStream.getTracks().forEach(track => track.stop());
  }
}

// 75. FileSemiLiveService.cleanupTempFiles()
private async cleanupTempFiles(): Promise<void> {
  const electronAPI = (window as any).electronAPI;
  
  // 76. Delete each temporary file
  for (const chunk of this.state.audioChunks) {
    await electronAPI.deleteFile(chunk.filePath);
  }
  
  // 77. Clear chunks array
  this.state.audioChunks = [];
}
```

#### Electron File Cleanup (main/index.js)
```javascript
// 78. IPC Handler: deleteFile
ipcMain.handle("deleteFile", async (event, filePath) => {
  try {
    // 79. Delete file from disk
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

---

## Key Features

### File-Based Approach Benefits
- **Reliability**: Uses proven `testSpeechWithFile` API instead of complex memory management
- **Stability**: Eliminates memory pressure and crashes from long recordings
- **Proven Pipeline**: Leverages existing, working transcription flow
- **Cleanup**: Automatic cleanup of temporary files after processing

### Processing Modes
1. **Continuous Mode**: Processes 1-second chunks immediately for real-time feedback
2. **Send-at-End Mode**: Accumulates chunks and processes when recording stops

### Error Handling
- Comprehensive try-catch blocks at each stage
- Graceful degradation when APIs are unavailable
- Automatic cleanup even when errors occur
- Detailed logging for debugging

### Performance Optimizations
- 1-second chunk duration for responsive feel
- Efficient WAV file creation with proper headers
- Memory-efficient audio buffer management
- Automatic temporary file cleanup 