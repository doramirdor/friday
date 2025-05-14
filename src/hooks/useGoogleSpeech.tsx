import { useState, useRef, useCallback } from 'react';

// Interface for the hook's return values
interface UseGoogleSpeechReturn {
  transcript: string;
  isRecording: boolean;
  error: Error | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetTranscript: () => void;
}

// For Electron access
declare global {
  interface Window {
    electronAPI?: {
      invokeGoogleSpeech?: (audioBuffer: ArrayBuffer) => Promise<string>;
    };
  }
}

// Options for recording
interface RecordingOptions {
  sampleRate?: number;
  language?: string;
}

const useGoogleSpeech = (options: RecordingOptions = {}): UseGoogleSpeechReturn => {
  const [transcript, setTranscript] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  
  // References to maintain state between renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Default options
  const sampleRate = options.sampleRate || 16000;
  const language = options.language || 'en-US';

  // Start recording audio
  const startRecording = useCallback(async (): Promise<void> => {
    try {
      // Reset state
      setError(null);
      audioChunksRef.current = [];

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // Set up event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
        
        // For live transcription, we can convert and send data immediately
        if (window.electronAPI?.invokeGoogleSpeech) {
          // Convert blob to ArrayBuffer
          const reader = new FileReader();
          reader.readAsArrayBuffer(event.data);
          reader.onloadend = async () => {
            try {
              const buffer = reader.result as ArrayBuffer;
              // Call Google Speech API via Electron
              const result = await window.electronAPI.invokeGoogleSpeech(buffer);
              setTranscript(prev => prev + ' ' + result);
            } catch (err) {
              setError(err instanceof Error ? err : new Error(String(err)));
            }
          };
        }
      };

      // Start recording
      mediaRecorder.start(1000); // Capture in 1-second chunks for streaming
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback((): void => {
    // Stop the media recorder
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    setIsRecording(false);
    
    // Process final audio in a real implementation
    // For now, we're processing chunks in real-time
  }, [isRecording]);

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