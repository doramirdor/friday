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
}

// Options for recording
interface RecordingOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  continuous?: boolean;
  encoding?: 'LINEAR16' | 'FLAC' | 'MP3';
  audioChannelCount?: number;
  model?: 'default' | 'phone_call' | 'video' | 'command_and_search';
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
      
      // Check if we have the Electron API
      if (!(window as unknown as ElectronWindow).electronAPI?.invokeGoogleSpeech) {
        console.error('❌ Google Speech API not available - Electron API missing');
        throw new Error('Google Speech API not available');
      }
      
      // Convert audio to format needed for Google Speech
      console.log('🔄 Converting audio to ArrayBuffer');
      const audioBuffer = await convertAudio(audioBlob);
      console.log('✅ Audio converted', { bufferByteLength: audioBuffer.byteLength });
      
      // Combine default options with any overrides
      const speechOptions = {
        sampleRateHertz: options.sampleRateHertz || sampleRate,
        languageCode: options.languageCode || language,
        encoding: options.encoding || encoding,
        audioChannelCount: options.audioChannelCount || audioChannelCount,
        model: options.model || model
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
          toast({
            title: 'Transcription Error',
            description: result,
            variant: 'destructive'
          });
          setError(new Error(result));
        } else {
          console.log('✅ Setting transcript with result');
          setTranscript(prev => {
            // If there's existing text, add a space before new content
            return prev ? `${prev} ${result}` : result;
          });
        }
      } else {
        console.warn('⚠️ Empty result from Google Speech API');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('❌ Exception in processAudioChunk:', errorMessage, err);
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
      
      const result = await (window as unknown as ElectronWindow).electronAPI.selectCredentialsFile();
      
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Google Cloud credentials updated successfully',
          variant: 'default'
        });
        return true;
      } else if (result.error) {
        toast({
          title: 'Error',
          description: `Failed to update credentials: ${result.error}`,
          variant: 'destructive'
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
      audioChunksRef.current = [];
      if (!options.continuous) {
        setTranscript('');
      }

      // Get audio stream using our system audio hook
      const stream = await getSystemAudioStream({
        sampleRate: options.sampleRateHertz || sampleRate,
        channelCount: options.audioChannelCount || audioChannelCount,
        echoCancellation: true,
        noiseSuppression: true,
      });
      
      streamRef.current = stream;

      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // Set up event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          // If continuous transcription is enabled, process each chunk
          const isContinuous = options.continuous !== undefined ? options.continuous : continuous;
          if (isContinuous && (window as unknown as ElectronWindow).electronAPI?.invokeGoogleSpeech) {
            processAudioChunk(event.data, options);
          }
        }
      };

      // Start recording
      mediaRecorder.start(2000); // Capture in 2-second chunks for streaming
      setIsRecording(true);
      
      toast({
        title: 'Recording Started',
        description: 'Audio recording has started',
        variant: 'default'
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      toast({
        title: 'Recording Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive'
      });
      console.error('Failed to start recording:', err);
    }
  }, [continuous, sampleRate, audioChannelCount, language, encoding, model, getSystemAudioStream, toast]);

  // Stop recording
  const stopRecording = useCallback((): void => {
    // Stop the media recorder
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      
      // Process all chunks at once if not in continuous mode
      if (!continuous && audioChunksRef.current.length > 0) {
        const completeBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        processAudioChunk(completeBlob);
      }
      
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
  }, [isRecording, continuous, toast]);

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
    selectCredentialsFile
  };
};

export default useGoogleSpeech;
