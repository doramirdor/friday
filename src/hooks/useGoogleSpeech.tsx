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
    sendMessage: (channel: string, data: unknown) => void;
    receive: (channel: string, callback: (...args: unknown[]) => void) => void;
    invokeGoogleSpeech: (audioBuffer: ArrayBuffer, options?: RecordingOptions) => Promise<string>;
    selectCredentialsFile: () => Promise<{success: boolean, error?: string, canceled?: boolean}>;
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
      
      // CRITICAL FIX: Use OGG_OPUS for WebM format regardless of codec
      // WebM container format is not directly compatible with Google Speech
      let speechEncoding: 'LINEAR16' | 'FLAC' | 'MP3' | 'OGG_OPUS' = encoding as any;
      
      if (audioBlob.type.includes('webm')) {
        // For WebM format, always use OGG_OPUS unless forceLinear16 is true
        if (options.forceLinear16) {
          speechEncoding = 'LINEAR16';
          console.log('🎯 Forcing LINEAR16 encoding for WebM audio (experimental)');
        } else {
          speechEncoding = 'OGG_OPUS';
          console.log('🎯 Using OGG_OPUS encoding for WebM audio');
        }
      } else if (audioBlob.type.includes('ogg')) {
        speechEncoding = 'OGG_OPUS';
        console.log('🎯 Using OGG_OPUS encoding for OGG audio');
      } else {
        speechEncoding = 'LINEAR16';
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
      
      console.log('📥 Received result from Google Speech API:', { 
        resultLength: result?.length,
        result: result?.substring(0, 100) + (result?.length > 100 ? '...' : '')
      });
      
      if (result) {
        // Check if the result starts with "Error:"
        if (result.startsWith('Error:')) {
          console.error('❌ Error from Google Speech API:', result);
          setLastErrorMessage(result);
          toast({
            title: 'Transcription Error',
            description: result,
            variant: 'destructive'
          });
          setError(new Error(result));
        } else if (result === 'No speech detected') {
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
            return prev ? `${prev} ${result}` : result;
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
        'audio/wav',
        'audio/webm;codecs=pcm',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus'
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
              // For WebM, use OGG_OPUS encoding, unless forceLinear16 is true
              encoding: (event.data.type.includes('webm') && !options.forceLinear16 ? 'OGG_OPUS' : 
                       event.data.type.includes('ogg') ? 'OGG_OPUS' : 'LINEAR16') as 'LINEAR16' | 'FLAC' | 'MP3' | 'OGG_OPUS',
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
              // Set encoding based on MIME type
              encoding: (mimeType.includes('webm') && !forceLinear16 ? 'OGG_OPUS' : 
                       mimeType.includes('ogg') ? 'OGG_OPUS' : 'LINEAR16') as 'LINEAR16' | 'FLAC' | 'MP3' | 'OGG_OPUS',
              sampleRateHertz: sampleRate,
              languageCode: language,
              continuous: false,
              model: 'command_and_search', // Better for short phrases
              boostAudio: true,           // Boost audio for better detection
              forceLinear16: forceLinear16
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

  return {
    transcript,
    isRecording,
    error,
    isProcessing,
    startRecording,
    stopRecording,
    resetTranscript,
    selectCredentialsFile,
    debugInfo: {
      audioFormat,
      sampleRate,
      lastError: lastErrorMessage,
      recordedChunks: audioChunksRef.current.length
    }
  };
};

export default useGoogleSpeech;
