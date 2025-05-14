import { useState, useRef, useCallback } from 'react';
import useSystemAudio from './useSystemAudio';

// Interface for the hook's return values
interface UseGoogleSpeechReturn {
  transcript: string;
  isRecording: boolean;
  error: Error | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetTranscript: () => void;
}

// Options for recording
interface RecordingOptions {
  sampleRate?: number;
  language?: string;
  continuous?: boolean;
}

// Define the Electron window interface
interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    sendMessage: (channel: string, data: unknown) => void;
    receive: (channel: string, callback: (...args: unknown[]) => void) => void;
    invokeGoogleSpeech: (audioBuffer: ArrayBuffer) => Promise<string>;
  }
}

const useGoogleSpeech = (options: RecordingOptions = {}): UseGoogleSpeechReturn => {
  const [transcript, setTranscript] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  
  // References to maintain state between renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const processingRef = useRef<boolean>(false);

  // Get our system audio hook
  const { getSystemAudioStream } = useSystemAudio();

  // Default options
  const sampleRate = options.sampleRate || 16000;
  const language = options.language || 'en-US';
  const continuous = options.continuous !== undefined ? options.continuous : true;

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
  const processAudioChunk = async (audioBlob: Blob) => {
    if (processingRef.current) return;
    
    try {
      processingRef.current = true;
      
      // Check if we have the Electron API
      if (!(window as unknown as ElectronWindow).electronAPI?.invokeGoogleSpeech) {
        throw new Error('Google Speech API not available');
      }
      
      // Convert audio to format needed for Google Speech
      const audioBuffer = await convertAudio(audioBlob);
      
      // Call Google Speech API via Electron
      const result = await (window as unknown as ElectronWindow).electronAPI.invokeGoogleSpeech(audioBuffer);
      
      if (result) {
        setTranscript(prev => {
          // If there's existing text, add a space before new content
          return prev ? `${prev} ${result}` : result;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.error('Speech recognition error:', err);
    } finally {
      processingRef.current = false;
    }
  };

  // Start recording audio
  const startRecording = useCallback(async (): Promise<void> => {
    try {
      // Reset state
      setError(null);
      audioChunksRef.current = [];
      setTranscript('');

      // Get audio stream using our system audio hook
      const stream = await getSystemAudioStream({
        sampleRate,
        channelCount: 1,
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
          if (continuous && (window as unknown as ElectronWindow).electronAPI?.invokeGoogleSpeech) {
            processAudioChunk(event.data);
          }
        }
      };

      // Start recording
      mediaRecorder.start(2000); // Capture in 2-second chunks for streaming
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.error('Failed to start recording:', err);
    }
  }, [continuous, sampleRate, getSystemAudioStream]);

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
    }
    
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    setIsRecording(false);
  }, [isRecording, continuous]);

  // Reset transcript
  const resetTranscript = useCallback((): void => {
    setTranscript('');
  }, []);

  return {
    transcript,
    isRecording,
    error,
    startRecording,
    stopRecording,
    resetTranscript,
  };
};

export default useGoogleSpeech;
