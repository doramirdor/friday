# Gemini Semi-Live Transcription Flow

This document outlines the complete method call flow for the Gemini Semi-Live transcription system, which uses a file-based approach with 2-second audio chunks for near real-time transcription.

## Overview

The Gemini Semi-Live system captures audio in real-time, saves it as temporary WAV files every 2 seconds, and uses the same proven Gemini 2.0 Flash transcription pipeline as the regular flow. This approach leverages the existing stable transcription tools for consistency and reliability.

## Architecture Components

- **Frontend**: React component + hook
- **Service Layer**: File-based semi-live service with Gemini integration
- **Electron Main Process**: IPC handlers for file operations (`readAudioFile`, `saveAudioFile`, `deleteFile`)
- **Transcription Engine**: Gemini 2.0 Flash model (same as regular flow)

---

## Key Changes from Previous Version

### ✅ **New Transcription Engine**
- **Previous**: Google Cloud Speech-to-Text API via `testSpeechWithFile`
- **Current**: Gemini 2.0 Flash via `geminiService.transcribeAudio()`

### ✅ **Improved Chunk Duration**  
- **Previous**: 1-second chunks (too frequent)
- **Current**: 2-second chunks (better balance of responsiveness and performance)

### ✅ **Unified Transcription Pipeline**
- **Previous**: Separate transcription logic from regular flow
- **Current**: Reuses exact same `geminiService.transcribeAudio()` method

### ✅ **Enhanced File Operations**
- **Previous**: Only `testSpeechWithFile` and `deleteFile`
- **Current**: Uses `readAudioFile` (with size checking) + `saveAudioFile` + `deleteFile`

### ✅ **Prompt-Level Speaker Diarization**
- **Previous**: API-level diarization configuration
- **Current**: Prompt-level diarization performed by Gemini model, post-parsed client-side

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

// 6. FileSemiLiveService checks Gemini + Electron APIs
get isAvailable(): boolean {
  const electronAPI = window.electronAPI as ExtendedElectronAPI;
  return !!(electronAPI?.saveAudioFile) && 
         !!(electronAPI?.readAudioFile) &&
         !!(electronAPI?.deleteFile) &&
         geminiService.isAvailable(); // NEW: Requires Gemini service
}
```

---

### 2. Recording Start Phase

#### User Interface Action
```javascript
// 7. User clicks start recording button
const handleStartRecording = () => {
  geminiLive.startRecording({
    chunkDurationMs: 2000, // NEW: 2-second chunks
    processingMode: 'continuous',
    enableSpeakerDiarization: true,
    maxSpeakerCount: 4
  });
}
```

#### Hook Processing (useGeminiSemiLive.tsx)
```javascript
// 8. Hook calls service startRecording
const startRecording = useCallback(async (options) => {
  if (!service.isAvailable) return false;
  
  const success = await service.startRecording({
    chunkDurationMs: 2000, // NEW: Default 2 seconds
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
  console.log('🎤 Starting File-based Semi-Live recording with Gemini 2.0 Flash:', options);
  
  // 11. Initialize state with new defaults
  this.currentOptions = options;
  this.state.processingMode = options.processingMode || 'continuous';
  this.state.chunkDurationMs = options.chunkDurationMs || 2000; // NEW: 2-second default
  this.state.isRecording = true;
  this.state.audioChunks = [];
  this.audioBuffer = []; // NEW: Separate audio buffer management
  
  // 12. Start microphone capture
  const success = await this.startMicrophoneCapture(options);
  
  // 13. Setup processing interval (if continuous mode)
  if (this.state.processingMode === 'continuous') {
    console.log('🔄 Using continuous mode - processing files every', this.state.chunkDurationMs, 'ms with Gemini 2.0 Flash');
    this.setupAudioProcessingInterval();
  }
  
  return success;
}
```

#### Audio Capture Setup (gemini-semi-live.ts)
```javascript
// 14. FileSemiLiveService.startMicrophoneCapture()
private async startMicrophoneCapture(options: FileSemiLiveOptions): Promise<boolean> {
  console.log('🎙️ Starting microphone capture for Semi-Live Gemini transcription');
  
  // 15. Get microphone permission
  this.mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { 
      sampleRate: 16000, 
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
  });
  
  // 16. Create audio context
  this.audioContext = new AudioContext({ sampleRate: 16000 });
  
  // 17. Setup audio processing chain
  const source = this.audioContext.createMediaStreamSource(this.mediaStream);
  this.gainNode = this.audioContext.createGain();
  this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
  
  // 18. Setup audio data handler - NEW: Buffer management
  this.scriptProcessor.onaudioprocess = (event) => {
    if (!this.state.isRecording) return;
    
    const inputData = event.inputBuffer.getChannelData(0);
    if (inputData && inputData.length > 0) {
      this.audioBuffer.push(new Float32Array(inputData)); // NEW: Push to buffer
    }
  };
  
  // 19. Connect audio processing pipeline
  source.connect(this.gainNode);
  this.gainNode.connect(this.scriptProcessor);
  this.scriptProcessor.connect(this.audioContext.destination);
  
  return true;
}
```

#### Audio Processing Interval (gemini-semi-live.ts)
```javascript
// 20. FileSemiLiveService.setupAudioProcessingInterval()
private setupAudioProcessingInterval(): void {
  this.processingInterval = window.setInterval(async () => {
    if (!this.state.isRecording || this.audioBuffer.length === 0) {
      return;
    }

    // 21. NEW: Process accumulated audio buffer every 2 seconds
    console.log(`🔄 Processing audio buffer (${this.audioBuffer.length} chunks) for Gemini transcription`);
    
    // 22. Combine audio chunks into single buffer
    const totalLength = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedBuffer = new Float32Array(totalLength);
    
    let offset = 0;
    for (const chunk of this.audioBuffer) {
      combinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // 23. Clear buffer for next chunk
    this.audioBuffer = [];

    // 24. Skip if too small (less than 0.5 seconds)
    if (combinedBuffer.length < 8000) return; // 0.5 seconds at 16kHz

    // 25. Save as temporary WAV file
    await this.saveAudioChunkAsFile(combinedBuffer, 16000);

    // 26. Process immediately with Gemini (continuous mode)
    if (this.state.processingMode === 'continuous' && this.state.audioChunks.length > 0) {
      const latestChunk = this.state.audioChunks[this.state.audioChunks.length - 1];
      await this.processChunkWithGemini(latestChunk); // NEW: Gemini processing
    }

  }, this.state.chunkDurationMs); // NEW: 2-second interval
}
```

---

### 3. Real-Time File Processing Phase

#### File Save Operation (gemini-semi-live.ts)
```javascript
// 27. FileSemiLiveService.saveAudioChunkAsFile()
private async saveAudioChunkAsFile(audioData: Float32Array, sampleRate: number): Promise<void> {
  const electronAPI = window.electronAPI as ExtendedElectronAPI;
  
  // 28. Convert to 16-bit PCM
  const pcmData = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    pcmData[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
  }

  // 29. Create WAV file buffer
  const wavBuffer = this.createWavFile(pcmData, sampleRate);
  
  // 30. Save as temporary file
  const filename = `semilive_gemini_${Date.now()}_${this.state.tempFileCounter++}.wav`;
  const result = await electronAPI.saveAudioFile(wavBuffer, filename, ['wav']);
  
  // 31. Add to processing queue
  if (result.success && result.filePath) {
    this.state.audioChunks.push({
      timestamp: Date.now(),
      filePath: result.filePath,
      size: wavBuffer.byteLength
    });
  }
}
```

#### Electron Main Process (main/index.js)
```javascript
// 32. IPC Handler: saveAudioFile (existing)
ipcMain.handle("saveAudioFile", async (event, buffer, filename, formats) => {
  // 33. Create file in recordings directory
  const filePath = path.join(recordingsDir, filename);
  
  // 34. Write buffer to disk
  fs.writeFileSync(filePath, Buffer.from(buffer));
  
  return { success: true, filePath };
});
```

---

### 4. NEW: Gemini Transcription Processing Phase

#### Chunk Processing with Gemini (gemini-semi-live.ts)
```javascript
// 35. NEW: FileSemiLiveService.processChunkWithGemini()
private async processChunkWithGemini(chunk: AudioChunk): Promise<void> {
  console.log(`🧠 Transcribing chunk with Gemini 2.0 Flash: ${chunk.filePath}`);
  const startTime = Date.now();

  // 36. NEW: Use same Gemini transcription method as regular flow
  const result: GeminiTranscriptionResult = await geminiService.transcribeAudio(
    chunk.filePath,
    this.currentOptions?.maxSpeakerCount || 4
  );

  const processingTime = Date.now() - startTime;
  console.log(`⚡ Gemini transcription completed in ${processingTime}ms`);

  // 37. Process successful result
  if (result.transcript && result.transcript.trim()) {
    const fileSemiResult: FileSemiLiveResult = {
      transcript: result.transcript,
      isFinal: true, // NEW: Gemini results are always final
      speakers: result.speakers?.map(speaker => ({
        id: speaker.id,
        name: speaker.name,
        color: speaker.color
      })) || [],
      timestamp: chunk.timestamp
    };

    // 38. Emit result to callback
    this.emitResult(fileSemiResult);
  }

  // 39. Cleanup processed chunk
  this.state.audioChunks = this.state.audioChunks.filter(c => c.filePath !== chunk.filePath);
  this.state.totalChunksProcessed++;
  await this.cleanupFile(chunk.filePath);
}
```

#### NEW: Gemini Service Integration (uses existing proven method)
```javascript
// 40. geminiService.transcribeAudio() - REUSED FROM REGULAR FLOW
// This is the exact same method used for regular transcription
async transcribeAudio(audioFile: string, maxSpeakers: number = 4): Promise<GeminiTranscriptionResult> {
  // 41. Use existing readAudioFile IPC
  const electronAPI = window.electronAPI;
  const audioData = await electronAPI.readAudioFile(audioFile);
  
  // 42. Check file size limit (Gemini 20MB limit)
  if (!audioData.success) {
    throw new Error(`Failed to read audio file: ${audioData.error || 'Unknown error'}`);
  }
  
  // 43. Convert to Blob and upload to Gemini
  const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });
  const uploadedFile = await this.genAI.files.upload({
    file: audioBlob,
    config: { mimeType: 'audio/mp3' }
  });

  // 44. Create transcription prompt with speaker diarization
  const prompt = `Please provide a detailed transcription of this audio with speaker diarization. 

Requirements:
1. Identify different speakers and label them as "Speaker 1", "Speaker 2", etc.
2. Limit the number of speakers to a maximum of ${maxSpeakers} speakers
3. If you detect more than ${maxSpeakers} different voices, group similar voices together
4. Format the output with each speaker's dialogue on separate lines
5. Use the format: "Speaker X: [dialogue]"
6. Maintain chronological order of the conversation

Please provide the transcription:`;

  // 45. Call Gemini 2.0 Flash model
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

  // 46. Parse transcription and extract speakers
  const { transcript, speakers } = await this.parseTranscriptionWithSpeakers(result.text, maxSpeakers);

  // 47. Cleanup uploaded file
  await this.genAI.files.delete(uploadedFile.name);

  return { transcript, speakers };
}
```

#### Electron IPC: readAudioFile (main/index.js)
```javascript
// 48. NEW: IPC Handler: readAudioFile (size-checked)
ipcMain.handle("readAudioFile", async (event, filepath) => {
  // 49. Check file existence
  if (!fs.existsSync(filepath)) {
    return { success: false, error: "File not found" };
  }
  
  // 50. Get file size statistics  
  const stats = fs.statSync(filepath);
  const fileSizeMB = stats.size / (1024 * 1024);
  
  // 51. Check file size limit (Gemini 20MB limit)
  if (fileSizeMB > 20) {
    return { 
      success: false, 
      error: `File too large for Gemini transcription (${fileSizeMB.toFixed(2)} MB). Maximum size is 20MB.`
    };
  }
  
  // 52. Read the audio file as buffer
  const buffer = fs.readFileSync(filepath);
  
  // 53. Return successful result
  return {
    success: true,
    buffer: buffer,
    fileSizeMB: fileSizeMB
  };
});
```

---

### 5. Result Processing Phase (Same as Regular Flow)

#### Result Handling (gemini-semi-live.ts)
```javascript
// 54. FileSemiLiveService.emitResult()
private emitResult(result: FileSemiLiveResult): void {
  if (this.resultCallback) {
    this.resultCallback(result);
  }
}
```

#### Hook Result Processing (useGeminiSemiLive.tsx)
```javascript
// 55. Hook registers result callback
useEffect(() => {
  if (service) {
    service.onResult((result) => {
      // 56. Update transcript state
      setTranscript(prev => prev + '\n' + result.transcript);
      
      // 57. Update speakers
      if (result.speakers) {
        setSpeakers(result.speakers);
      }
      
      // 58. Emit to parent component
      onTranscriptResult?.(result);
    });
  }
}, [service]);
```

#### Component Integration (TranscriptDetails.tsx)
```javascript
// 59. Component receives transcription result (same processing as regular flow)
const handleAddGeminiTranscript = useCallback((transcript: string) => {
  // 60. Parse transcript into lines - SAME AS REGULAR FLOW
  const lines = transcript.split('\n').filter(line => line.trim());
  const newTranscriptLines: TranscriptLine[] = [];
  
  // 61. Process each line for speakers - SAME PARSING LOGIC
  lines.forEach((line, index) => {
    const speakerMatch = line.match(/^(Speaker\s+\d+):\s*(.+)$/i);
    
    if (speakerMatch) {
      const speakerName = speakerMatch[1];
      const text = speakerMatch[2].trim();
      
      // 62. Create transcript line
      newTranscriptLines.push({
        id: `gemini-semi-${Date.now()}-${index}`,
        text: text,
        speakerId: speakerMatch[1].replace(/\D/g, ''), // Extract number
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
  console.log('🛑 Stopping Semi-Live Gemini transcription recording...');
  this.state.isRecording = false;

  // 65. Clear processing interval
  if (this.processingInterval) {
    clearInterval(this.processingInterval);
    this.processingInterval = null;
  }

  let results: FileSemiLiveResult[] = [];

  // 66. Process remaining audio buffer
  if (this.audioBuffer.length > 0) {
    console.log('📝 Processing final audio buffer with Gemini...');
    // ... (combine and save remaining audio)
  }

  // 67. Process accumulated files (send-at-end mode)
  if (this.state.processingMode === 'send-at-end') {
    console.log('📤 Processing all audio chunks with Gemini at end...');
    results = await this.processAccumulatedAudioFilesWithGemini();
  }

  // 68. Cleanup all temporary files
  await this.cleanupTempFiles();
  
  // 69. Cleanup audio resources
  this.cleanupAudioResources();

  return results;
}
```

#### Resource Cleanup (gemini-semi-live.ts)
```javascript
// 70. FileSemiLiveService.cleanupTempFiles()
private async cleanupTempFiles(): Promise<void> {
  const electronAPI = window.electronAPI as ExtendedElectronAPI;
  
  // 71. Delete each temporary file
  for (const chunk of this.state.audioChunks) {
    await electronAPI.deleteFile(chunk.filePath);
  }
  
  // 72. Clear chunks array
  this.state.audioChunks = [];
}
```

#### Electron File Cleanup (main/index.js)
```javascript
// 73. IPC Handler: deleteFile (existing)
ipcMain.handle("deleteFile", async (event, filePath) => {
  try {
    // 74. Delete file from disk
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

## Key Benefits of the New Approach

### 🚀 **Unified Transcription Pipeline**
- Reuses the exact same `geminiService.transcribeAudio()` method as regular flow
- Ensures consistency in transcription quality and speaker diarization
- Leverages proven, tested transcription logic

### ⚡ **Optimized Performance**
- 2-second chunks provide better balance of responsiveness vs. processing overhead
- Reduced API calls compared to 1-second chunks
- More efficient processing with larger, meaningful audio segments

### 🔒 **Enhanced Reliability**
- Uses the same file-based approach with proven IPC handlers
- Consistent error handling and cleanup across regular and semi-live flows
- Size-checked file operations prevent Gemini API failures

### 🎯 **Improved Speaker Diarization**
- Prompt-level diarization leverages Gemini's natural language understanding
- Post-parsed client-side for consistent speaker identification
- Same speaker parsing logic as regular flow ensures compatibility

### 🧹 **Better Resource Management**
- Automatic cleanup of temporary files after processing
- Efficient audio buffer management prevents memory issues
- Proper resource cleanup on errors and stop operations

## Technical Advantages

1. **Code Reuse**: 95% of transcription logic shared with regular flow
2. **Consistency**: Same prompt, same parsing, same result format
3. **Reliability**: Leverages proven file operations and error handling
4. **Performance**: Optimized 2-second processing intervals
5. **Maintainability**: Single transcription service to maintain and improve 