import { useState, useRef, useCallback, useEffect } from 'react';
import useSystemAudio from './useSystemAudio';
import { useToast } from '@/hooks/use-toast';

// Interface for the hook's return values
interface UseGoogleSpeechReturn {
  transcript: string;
  isRecording: boolean;
  error: Error | null;
  startRecording: (options?: RecordingOptions) => Promise<void>;
  stopRecording: () => void;
  resetTranscript: () => void;
  isProcessing: boolean;
  selectCredentialsFile: () => Promise<boolean>;
  testWithFile: (filePath: string) => Promise<void>;
  testMP3Conversion: (audioBlob?: Blob) => Promise<void>;
  debugInfo: {
    audioFormat: string;
    sampleRate: number;
    lastError: string | null;
    recordedChunks: number;
  };
}

// Options for recording
interface RecordingOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  continuous?: boolean;
  encoding?: 'LINEAR16' | 'FLAC' | 'MP3' | 'OGG_OPUS';
  audioChannelCount?: number;
  model?: 'default' | 'phone_call' | 'video' | 'command_and_search';
  forceLinear16?: boolean;
  boostAudio?: boolean;   // Add option to boost audio levels
}

// Define the Electron window interface
interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    appPath: string;
    sendMessage: (channel: string, data: unknown) => void;
    receive: (channel: string, callback: (...args: unknown[]) => void) => void;
    invokeGoogleSpeech: (audioBuffer: ArrayBuffer, options?: RecordingOptions) => Promise<string>;
    selectCredentialsFile: () => Promise<{success: boolean, error?: string, canceled?: boolean}>;
    testSpeechWithFile: (filePath: string) => Promise<{error?: string, transcription?: string}>;
    saveAudioFile: (buffer: ArrayBuffer, filename: string, formats?: string[]) => Promise<{
      success: boolean;
      files?: Array<{format: string, path: string}>;
      filePath?: string;
      message?: string;
    }>;
  }
}

const useGoogleSpeech = (defaultOptions: RecordingOptions = {}): UseGoogleSpeechReturn => {
  const [transcript, setTranscript] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // Debug state
  const [audioFormat, setAudioFormat] = useState<string>('unknown');
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [recordedChunksCount, setRecordedChunksCount] = useState<number>(0);
  
  // References to maintain state between renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  // Get our system audio hook
  const { getSystemAudioStream } = useSystemAudio();

  // Default options
  const sampleRate = defaultOptions.sampleRateHertz || 16000;
  const language = defaultOptions.languageCode || 'en-US';
  const continuous = defaultOptions.continuous !== undefined ? defaultOptions.continuous : true;
  const encoding = defaultOptions.encoding || 'LINEAR16';
  const audioChannelCount = defaultOptions.audioChannelCount || 1;
  const model = defaultOptions.model || 'default';
  const forceLinear16 = defaultOptions.forceLinear16 !== undefined ? defaultOptions.forceLinear16 : false;

  // Cleanup function
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }
    };
  }, []);

  // Convert audio format if needed
  const convertAudio = async (audioBlob: Blob): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          resolve(reader.result as ArrayBuffer);
        } else {
          reject(new Error('Failed to convert audio'));
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  };

  // Process audio chunks and send to Google Speech API
  const processAudioChunk = async (audioBlob: Blob, options: RecordingOptions = {}) => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      console.log('🔍 Processing audio chunk', { 
        blobSize: audioBlob.size, 
        blobType: audioBlob.type,
        options
      });
      
      // Update debug info
      setAudioFormat(audioBlob.type);
      setRecordedChunksCount(audioChunksRef.current.length);
      
      // Check if we have the Electron API
      if (!(window as unknown as ElectronWindow).electronAPI?.invokeGoogleSpeech) {
        console.error('❌ Google Speech API not available - Electron API missing');
        const errorMsg = 'Google Speech API not available';
        setLastErrorMessage(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Convert audio to format needed for Google Speech
      console.log('🔄 Converting audio to ArrayBuffer');
      const audioBuffer = await convertAudio(audioBlob);
      console.log('✅ Audio converted', { bufferByteLength: audioBuffer.byteLength });
      
      let transcriptionResult: string | undefined = undefined;
      
      // Generate a timestamp-based filename for saving
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording-${timestamp}`;
      
      // For WebM/Opus format, save as MP3 first for better compatibility
      if (audioBlob.type.includes('webm') || audioBlob.type.includes('opus') || audioBlob.type.includes('ogg')) {
        // Only proceed if saveAudioFile is available
        if ((window as unknown as ElectronWindow).electronAPI?.saveAudioFile) {
          console.log('📦 Saving audio as MP3 for better compatibility with Google Speech API');
          
          try {
            // Save with MP3 prioritized
            console.log(`💾 Attempting to save audio with filename: ${filename}, buffer size: ${audioBuffer.byteLength}`);
            const saveResult = await (window as unknown as ElectronWindow).electronAPI.saveAudioFile(
              audioBuffer, 
              filename, 
              ['mp3', 'wav']
            );
            
            console.log('💾 Save result:', JSON.stringify(saveResult, null, 2));
            
            if (saveResult.success) {
              // Check if we have the files array (newer format) or filePath (older format)
              if (saveResult.files && saveResult.files.length > 0) {
                console.log(`📄 Saved files: ${saveResult.files.map(f => `${f.format}:${f.path}`).join(', ')}`);
                
                // Find MP3 file
                const mp3File = saveResult.files.find(f => f.format === 'mp3');
                
                if (mp3File) {
                  console.log('🎵 Using saved MP3 file for transcription:', mp3File.path);
                  
                  // Now use testSpeechWithFile to transcribe the MP3 file
                  if ((window as unknown as ElectronWindow).electronAPI?.testSpeechWithFile) {
                    console.log('🔄 Calling testSpeechWithFile with path:', mp3File.path);
                    const testResult = await (window as unknown as ElectronWindow).electronAPI.testSpeechWithFile(mp3File.path);
                    
                    console.log('🔄 testSpeechWithFile result:', JSON.stringify(testResult, null, 2));
                    
                    if (testResult && typeof testResult === 'string') {
                      if (!(testResult as string).includes('Error:')) {
                        transcriptionResult = testResult;
                        console.log('✅ MP3 file transcription successful:', transcriptionResult);
                      } else {
                        console.warn('⚠️ Error in transcription response:', testResult);
                      }
                    } else if (testResult && typeof testResult === 'object' && testResult.transcription) {
                      transcriptionResult = testResult.transcription;
                      console.log('✅ MP3 file transcription successful:', transcriptionResult);
                    } else {
                      console.warn('⚠️ MP3 transcription failed, falling back to direct method');
                      if (testResult && typeof testResult === 'object' && testResult.error) {
                        console.warn('⚠️ Error from testSpeechWithFile:', testResult.error);
                      }
                    }
                  } else {
                    console.warn('⚠️ testSpeechWithFile not available');
                  }
                } else {
                  console.log('⚠️ No MP3 file found in saved files, using default method');
                  console.log('📄 Available files:', saveResult.files);
                }
              } else if (saveResult.filePath) {
                // Handle legacy format where we just get a filePath
                const filePath = saveResult.filePath;
                // Check if the filePath has an extension, and if not, assume it's an MP3
                const hasExtension = /\.\w+$/.test(filePath);
                const mp3Path = hasExtension ? filePath : `${filePath}.mp3`;
                
                console.log('🎵 Using saved file for transcription:', mp3Path);
                
                // Now use testSpeechWithFile to transcribe the file
                if ((window as unknown as ElectronWindow).electronAPI?.testSpeechWithFile) {
                  console.log('🔄 Calling testSpeechWithFile with path:', mp3Path);
                  const testResult = await (window as unknown as ElectronWindow).electronAPI.testSpeechWithFile(mp3Path);
                  
                  console.log('🔄 testSpeechWithFile result:', JSON.stringify(testResult, null, 2));
                  
                  if (testResult && typeof testResult === 'string') {
                    if (!(testResult as string).includes('Error:')) {
                      transcriptionResult = testResult;
                      console.log('✅ File transcription successful:', transcriptionResult);
                    } else {
                      console.warn('⚠️ Error in transcription response:', testResult);
                    }
                  } else if (testResult && typeof testResult === 'object' && testResult.transcription) {
                    transcriptionResult = testResult.transcription;
                    console.log('✅ File transcription successful:', transcriptionResult);
                  } else {
                    console.warn('⚠️ Transcription failed, falling back to direct method');
                    if (testResult && typeof testResult === 'object' && testResult.error) {
                      console.warn('⚠️ Error from testSpeechWithFile:', testResult.error);
                    }
                  }
                } else {
                  console.warn('⚠️ testSpeechWithFile not available');
                }
              } else {
                console.warn('⚠️ No files or filePath returned, using default method');
                if (saveResult.message) {
                  console.warn('⚠️ Save message:', saveResult.message);
                }
              }
            } else {
              console.warn('⚠️ File save unsuccessful');
              if (saveResult.message) {
                console.warn('⚠️ Save message:', saveResult.message);
              }
            }
          } catch (saveError) {
            console.error('❌ Error saving audio file:', saveError);
            console.log('⚠️ Falling back to direct transcription method');
          }
        } else {
          console.warn('⚠️ saveAudioFile not available in electronAPI');
        }
      } else {
        console.log(`ℹ️ Using direct transcription for ${audioBlob.type} - not webm/opus/ogg`);
      }
      
      // If we don't have a result yet from the MP3 approach, use the standard method
      if (!transcriptionResult) {
        console.log('🔄 Using standard transcription method as fallback');
        
        // CRITICAL FIX: Use OGG_OPUS for WebM format regardless of codec
        // WebM container format is not directly compatible with Google Speech
        let speechEncoding: 'LINEAR16' | 'FLAC' | 'MP3' | 'OGG_OPUS' = encoding as any;
        
        if (audioBlob.type.includes('webm') || audioBlob.type.includes('ogg')) {
          speechEncoding = 'OGG_OPUS';
          console.log('🎯 Using OGG_OPUS encoding');
        } else {
          speechEncoding = 'LINEAR16';   // only for real WAV/raw PCM
          console.log('🎯 Using LINEAR16 encoding for other audio');
        }
        
        // Combine default options with any overrides
        const speechOptions = {
          sampleRateHertz: options.sampleRateHertz || sampleRate,
          languageCode: options.languageCode || language,
          encoding: options.encoding || speechEncoding,
          audioChannelCount: options.audioChannelCount || audioChannelCount,
          // Use command_and_search model for better accuracy with short phrases
          model: options.model || 'command_and_search',
          // Add option to force LINEAR16 even for WebM audio (for testing)
          forceLinear16: options.forceLinear16 || forceLinear16,
          // Add option to boost audio levels
          boostAudio: options.boostAudio !== undefined ? options.boostAudio : true
        };
        
        console.log('🚀 Sending to Google Speech API with options:', speechOptions);
        
        // Call Google Speech API via Electron
        const result = await (window as unknown as ElectronWindow).electronAPI.invokeGoogleSpeech(audioBuffer, speechOptions);
        console.log('🎯 Raw result from invokeGoogleSpeech:', result);
        transcriptionResult = result;
      }
      
      console.log('📥 Received result from Google Speech API:', { 
        resultLength: transcriptionResult?.length,
        result: transcriptionResult?.substring(0, 100) + (transcriptionResult?.length > 100 ? '...' : '')
      });
      
      if (transcriptionResult) {
        // Check if the result starts with "Error:"
        if (transcriptionResult.startsWith('Error:')) {
          console.error('❌ Error from Google Speech API:', transcriptionResult);
          setLastErrorMessage(transcriptionResult);
          toast({
            title: 'Transcription Error',
            description: transcriptionResult,
            variant: 'destructive'
          });
          setError(new Error(transcriptionResult));
        } else if (transcriptionResult === 'No speech detected') {
          console.warn('⚠️ No speech detected in audio');
          // Don't treat "No speech detected" as a real error
          // Just add it to the transcript so the user knows
          setTranscript(prev => {
            return prev ? `${prev} (No speech detected)` : 'No speech detected';
          });
        } else {
          console.log('✅ Setting transcript with result');
          setLastErrorMessage(null);
          setTranscript(prev => {
            // If there's existing text, add a space before new content
            return prev ? `${prev} ${transcriptionResult}` : transcriptionResult;
          });
        }
      } else {
        console.warn('⚠️ Empty result from Google Speech API');
        setLastErrorMessage('Empty result from API');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('❌ Exception in processAudioChunk:', errorMessage, err);
      setLastErrorMessage(errorMessage);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast({
        title: 'Speech Recognition Error',
        description: errorMessage,
        variant: 'destructive'
      });
      console.error('Speech recognition error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Allow selecting a custom credentials file
  const selectCredentialsFile = async (): Promise<boolean> => {
    try {
      if (!(window as unknown as ElectronWindow).electronAPI?.selectCredentialsFile) {
        toast({
          title: 'Not Available',
          description: 'This feature is only available in the desktop app',
          variant: 'destructive'
        });
        return false;
      }
      
      // Show instructions toast
      toast({
        title: 'Select Google Cloud Credentials',
        description: 'Select your google-credentials.json file from Google Cloud Console',
        variant: 'default'
      });
      
      const result = await (window as unknown as ElectronWindow).electronAPI.selectCredentialsFile();
      
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Google Cloud credentials updated successfully',
          variant: 'default'
        });
        // Provide info about restarting
        toast({
          title: 'Restart Required',
          description: 'Please restart the app for the new credentials to take effect',
          variant: 'default'
        });
        return true;
      } else if (result.canceled) {
        toast({
          title: 'Cancelled',
          description: 'Credentials selection was cancelled',
          variant: 'default'
        });
      } else if (result.error) {
        toast({
          title: 'Error',
          description: `Failed to update credentials: ${result.error}`,
          variant: 'destructive'
        });
        // Show how to get credentials
        toast({
          title: 'How to Get Credentials',
          description: 'Go to Google Cloud Console → APIs → Credentials → Create Service Account Key',
          duration: 6000,
          variant: 'default'
        });
      }
      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Error',
        description: `Failed to select credentials: ${errorMessage}`,
        variant: 'destructive'
      });
      return false;
    }
  };

  // Start recording audio
  const startRecording = useCallback(async (options: RecordingOptions = {}): Promise<void> => {
    try {
      // Reset state
      setError(null);
      setLastErrorMessage(null);
      audioChunksRef.current = [];
      setRecordedChunksCount(0);
      
      if (!options.continuous) {
        setTranscript('');
      }

      // Set better default sample rate for speech recognition
      // Google Speech API works best with 16000 Hz
      const useSampleRate = options.sampleRateHertz || 16000; // Standard rate for speech recognition
      
      console.log('🎤 Starting recording with sample rate:', useSampleRate);

      // Get audio stream using our system audio hook
      const stream = await getSystemAudioStream({
        sampleRate: useSampleRate,
        channelCount: options.audioChannelCount || 1, // Mono is better for speech
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      
      streamRef.current = stream;

      // Check for supported MIME types
      const checkMimeType = (mimeType: string) => {
        try {
          return MediaRecorder.isTypeSupported(mimeType);
        } catch (e) {
          return false;
        }
      };

      // Find the best supported MIME type for Google Speech compatibility
      let mimeType = 'audio/webm;codecs=pcm'; // Best for LINEAR16
      let recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 256000
      };

      console.log('🔍 Checking supported audio formats for MediaRecorder');
      
      // Try different formats in order of preference for Google Speech
      const formats = [
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/webm',           // fall-backs
        'audio/wav'
      ];
      
      for (const format of formats) {
        if (checkMimeType(format)) {
          console.log(`✅ Found supported format: ${format}`);
          mimeType = format;
          recorderOptions.mimeType = format;
          setAudioFormat(format);
          break;
        } else {
          console.log(`❌ Format not supported: ${format}`);
        }
      }
      
      console.log(`📊 Setting up MediaRecorder with ${mimeType}`);
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      // Set up event handlers
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          console.log(`📦 Received audio chunk: ${event.data.size} bytes, type: ${event.data.type}`);
          audioChunksRef.current.push(event.data);
          setRecordedChunksCount(audioChunksRef.current.length);
          
          // If continuous transcription is enabled, process each chunk
          const isContinuous = options.continuous !== undefined ? options.continuous : continuous;
          if (isContinuous && (window as unknown as ElectronWindow).electronAPI?.invokeGoogleSpeech) {
            // Pass the detected MIME type encoding to ensure proper format handling
            const audioOptions: RecordingOptions = {
              ...options,
              // Always use OGG_OPUS for WebM and OGG containers
              encoding: 'OGG_OPUS',
              // Use the actual sample rate
              sampleRateHertz: useSampleRate,
              // Pass forceLinear16 option
              forceLinear16: options.forceLinear16 || forceLinear16,
              // Use command_and_search model by default for better results with short phrases
              model: options.model || 'command_and_search',
              // Boost audio by default
              boostAudio: options.boostAudio !== undefined ? options.boostAudio : true
            };
            processAudioChunk(event.data, audioOptions);
          }
        }
      };

      // Start recording in smaller chunks for better real-time processing
      mediaRecorder.start(1000); // Capture in 1-second chunks for streaming
      setIsRecording(true);
      
      toast({
        title: 'Recording Started',
        description: 'Audio recording has started',
        variant: 'default'
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setLastErrorMessage(errorMessage);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast({
        title: 'Recording Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive'
      });
      console.error('Failed to start recording:', err);
    }
  }, [continuous, sampleRate, audioChannelCount, language, encoding, model, getSystemAudioStream, toast, forceLinear16]);

  // Stop recording
  const stopRecording = useCallback((): void => {
    // Stop the media recorder
    if (mediaRecorderRef.current && isRecording) {
      console.log('🛑 Stopping recording, processing final audio');
      
      // Add event handler for final chunk
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.addEventListener('dataavailable', async (event) => {
          if (event.data.size > 0) {
            console.log(`📦 Received final audio chunk: ${event.data.size} bytes, type: ${event.data.type}`);
            audioChunksRef.current.push(event.data);
            setRecordedChunksCount(audioChunksRef.current.length);
            
            // Get MIME type from the event data
            const mimeType = event.data.type;
            const finalOptions: RecordingOptions = {
              // Always use OGG_OPUS for WebM and OGG containers
              encoding: 'OGG_OPUS',
              sampleRateHertz: sampleRate,
              languageCode: language,
              continuous: false,
              model: 'command_and_search', // Better for short phrases
              boostAudio: true,           // Boost audio for better detection
              forceLinear16: false
            };
            
            if (!continuous && (window as unknown as ElectronWindow).electronAPI?.invokeGoogleSpeech) {
              console.log('🔄 Processing complete recording for transcription');
              // Process all chunks at once
              const completeBlob = new Blob(audioChunksRef.current, { type: mimeType });
              await processAudioChunk(completeBlob, finalOptions);
            }
          }
        }, { once: true });
      }
      
      mediaRecorderRef.current.stop();
      
      toast({
        title: 'Recording Stopped',
        description: 'Audio recording has stopped',
        variant: 'default'
      });
    }
    
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    setIsRecording(false);
  }, [isRecording, continuous, sampleRate, language, encoding, toast, forceLinear16]);

  // Reset transcript
  const resetTranscript = useCallback((): void => {
    setTranscript('');
  }, []);

  // Test with existing file
  const testWithFile = async (filePath: string): Promise<void> => {
    try {
      setIsProcessing(true);
      setLastErrorMessage(null);
      
      console.log('🔄 Testing with file:', filePath);
      
      // Check if we have the Electron API
      if (!(window as unknown as ElectronWindow).electronAPI?.testSpeechWithFile) {
        // If we're not in Electron, provide a mock implementation for dev mode
        if (!(window as unknown as ElectronWindow).electronAPI?.isElectron) {
          console.log('⚠️ Running in development mode - using mock test implementation');
          
          // Create a simulated delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Provide a mock transcription result
          const mockTranscription = "This is a simulated transcription result for development testing. The actual Google Speech API is only available in the Electron app.";
          setTranscript(mockTranscription);
          
          toast({
            title: 'Dev Mode Test',
            description: 'Mock transcription created (Electron required for real API access)',
            variant: 'default'
          });
          
          return;
        }
        
        // If we should be in Electron but the API is missing, show an error
        const errorMsg = 'Test function not available - Electron API missing';
        console.error('❌', errorMsg);
        setLastErrorMessage(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Call the Electron API to test with file
      const result = await (window as unknown as ElectronWindow).electronAPI.testSpeechWithFile(filePath);
      
      if (result.error) {
        const errorMsg = `Error testing file: ${result.error}`;
        console.error('❌', errorMsg);
        setLastErrorMessage(errorMsg);
        setError(new Error(errorMsg));
        toast({
          title: 'Test Failed',
          description: errorMsg,
          variant: 'destructive'
        });
        return;
      }
      
      if (result.transcription) {
        console.log('✅ Transcription result:', result.transcription);
        setTranscript(result.transcription);
        toast({
          title: 'Test Success',
          description: 'File transcribed successfully',
          variant: 'default'
        });
      } else {
        const errorMsg = 'No transcription returned';
        console.warn('⚠️', errorMsg);
        setLastErrorMessage(errorMsg);
        toast({
          title: 'Test Warning',
          description: errorMsg,
          variant: 'default'
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('❌ Exception in testWithFile:', errorMessage, err);
      setLastErrorMessage(errorMessage);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast({
        title: 'Test Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Test MP3 conversion specifically
  const testMP3Conversion = async (audioBlob?: Blob): Promise<void> => {
    try {
      setIsProcessing(true);
      setLastErrorMessage(null);
      
      console.log('🧪 Testing MP3 conversion');
      
      // If no blob is provided, create a simple test audio blob
      if (!audioBlob && audioChunksRef.current.length > 0) {
        // Use the most recent recording
        audioBlob = audioChunksRef.current[audioChunksRef.current.length - 1];
        console.log(`📄 Using latest recorded audio chunk: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      } else if (!audioBlob) {
        // Create a simple sine wave
        console.log('📄 Creating test audio blob (sine wave)');
        const sampleRate = 44100;
        const duration = 2; // seconds
        const numSamples = sampleRate * duration;
        
        // Create audio context for generating test tone
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
        const channelData = buffer.getChannelData(0);
        
        // Fill with sine wave
        for (let i = 0; i < numSamples; i++) {
          channelData[i] = Math.sin(440 * Math.PI * 2 * i / sampleRate) * 0.5;
        }
        
        // Convert to WAV-like format
        const offlineCtx = new OfflineAudioContext(1, numSamples, sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start();
        
        const renderedBuffer = await offlineCtx.startRendering();
        
        // Convert buffer to Blob
        const wavBlob = await new Promise<Blob>((resolve) => {
          const waveArray = new Float32Array(renderedBuffer.length);
          renderedBuffer.copyFromChannel(waveArray, 0);
          
          // Simple WAV format creation
          const dataView = new DataView(new ArrayBuffer(44 + waveArray.length * 2));
          
          // Write WAV header
          writeString(dataView, 0, 'RIFF');
          dataView.setUint32(4, 36 + waveArray.length * 2, true);
          writeString(dataView, 8, 'WAVE');
          writeString(dataView, 12, 'fmt ');
          dataView.setUint32(16, 16, true);
          dataView.setUint16(20, 1, true);
          dataView.setUint16(22, 1, true);
          dataView.setUint32(24, sampleRate, true);
          dataView.setUint32(28, sampleRate * 2, true);
          dataView.setUint16(32, 2, true);
          dataView.setUint16(34, 16, true);
          writeString(dataView, 36, 'data');
          dataView.setUint32(40, waveArray.length * 2, true);
          
          // Write audio data
          for (let i = 0; i < waveArray.length; i++) {
            dataView.setInt16(44 + i * 2, waveArray[i] * 32767, true);
          }
          
          resolve(new Blob([dataView], { type: 'audio/wav' }));
        });
        
        audioBlob = wavBlob;
        console.log(`📄 Created test audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
        
        // Helper function to write string to DataView
        function writeString(dataView: DataView, offset: number, string: string) {
          for (let i = 0; i < string.length; i++) {
            dataView.setUint8(offset + i, string.charCodeAt(i));
          }
        }
      }
      
      // Convert to ArrayBuffer
      console.log('🔄 Converting audio blob to ArrayBuffer');
      const audioBuffer = await convertAudio(audioBlob);
      console.log(`✅ Converted to ArrayBuffer: ${audioBuffer.byteLength} bytes`);
      
      // Save as MP3
      if ((window as unknown as ElectronWindow).electronAPI?.saveAudioFile) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `test-mp3-conversion-${timestamp}`;
        
        console.log(`💾 Saving test audio as MP3: ${filename}`);
        const saveResult = await (window as unknown as ElectronWindow).electronAPI.saveAudioFile(
          audioBuffer,
          filename,
          ['mp3', 'wav']
        );
        
        console.log('💾 Save result:', JSON.stringify(saveResult, null, 2));
        
        if (saveResult.success) {
          let mp3FilePath = '';
          
          // Check if we have the files array (newer format) or filePath (older format)
          if (saveResult.files && saveResult.files.length > 0) {
            console.log(`📄 Saved files: ${saveResult.files.map(f => `${f.format}:${f.path}`).join(', ')}`);
            
            // Find MP3 file
            const mp3File = saveResult.files.find(f => f.format === 'mp3');
            
            if (mp3File) {
              mp3FilePath = mp3File.path;
            }
          } else if (saveResult.filePath) {
            // Handle legacy format where we just get a filePath
            const filePath = saveResult.filePath;
            // Check if the filePath has an extension, and if not, assume it's an MP3
            const hasExtension = /\.\w+$/.test(filePath);
            mp3FilePath = hasExtension ? filePath : `${filePath}.mp3`;
            console.log(`📄 Using file path: ${mp3FilePath}`);
          }
          
          if (mp3FilePath) {
            console.log('🎵 Testing transcription with file:', mp3FilePath);
            
            // Now use testSpeechWithFile to transcribe the MP3 file
            if ((window as unknown as ElectronWindow).electronAPI?.testSpeechWithFile) {
              const testResult = await (window as unknown as ElectronWindow).electronAPI.testSpeechWithFile(mp3FilePath);
              
              if (typeof testResult === 'string') {
                console.log('✅ MP3 test transcription result (string):', testResult);
                setTranscript(`Test result: ${testResult}`);
              } else if (testResult && typeof testResult === 'object') {
                console.log('✅ MP3 test transcription result (object):', testResult);
                if (testResult.transcription) {
                  setTranscript(`Test result: ${testResult.transcription}`);
                } else if (testResult.error) {
                  console.error('❌ Error in test transcription:', testResult.error);
                  setTranscript(`Test error: ${testResult.error}`);
                }
              } else {
                console.warn('⚠️ Unexpected test result type:', typeof testResult);
                setTranscript('Test completed but no result returned');
              }
              
              toast({
                title: 'MP3 Conversion Test Complete',
                description: `Files saved to: ${mp3FilePath}`,
                variant: 'default'
              });
            } else {
              console.error('❌ testSpeechWithFile not available');
              setTranscript('Error: testSpeechWithFile not available');
            }
          } else {
            console.error('❌ No file path available');
            setTranscript('Error: No valid file path found');
          }
        } else {
          console.error('❌ File save failed');
          setTranscript('Error: File save failed');
        }
      } else {
        console.error('❌ saveAudioFile not available');
        setTranscript('Error: saveAudioFile not available');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('❌ Exception in testMP3Conversion:', errorMessage, err);
      setLastErrorMessage(errorMessage);
      setTranscript(`Error testing MP3 conversion: ${errorMessage}`);
      toast({
        title: 'Test Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    transcript,
    isRecording,
    error,
    isProcessing,
    startRecording,
    stopRecording,
    resetTranscript,
    selectCredentialsFile,
    testWithFile,
    testMP3Conversion,
    debugInfo: {
      audioFormat,
      sampleRate,
      lastError: lastErrorMessage,
      recordedChunks: audioChunksRef.current.length
    }
  };
};

export default useGoogleSpeech;
