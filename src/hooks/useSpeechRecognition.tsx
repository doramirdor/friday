import { useState, useEffect, useCallback, useRef } from 'react';

interface SpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
}

interface UseSpeechRecognitionReturn {
  transcript: string;
  isRecording: boolean;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  resetTranscript: () => void;
}

// Type definition for browser's SpeechRecognition API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onerror: (event: any) => void;
  onresult: (event: any) => void;
  onend: () => void;
}

// Define browser-specific SpeechRecognition constructor
interface Window {
  SpeechRecognition: new () => SpeechRecognition;
  webkitSpeechRecognition: new () => SpeechRecognition;
}

const useSpeechRecognition = (options: SpeechRecognitionOptions = {}): UseSpeechRecognitionReturn => {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Keep reference to the recognition instance
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  // Initialize speech recognition
  useEffect(() => {
    // Check if browser supports speech recognition
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
      setError('Your browser does not support speech recognition');
      return;
    }

    // Get the SpeechRecognition constructor
    const SpeechRecognitionConstructor = (
      window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    // Create an instance
    recognitionRef.current = new SpeechRecognitionConstructor();
    
    // Configure options
    recognitionRef.current.continuous = options.continuous ?? true;
    recognitionRef.current.interimResults = options.interimResults ?? true;
    recognitionRef.current.lang = options.language ?? 'en-US';
    
    // Event handlers
    recognitionRef.current.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Update transcript state
      setTranscript(prev => prev + finalTranscript);
    };
    
    recognitionRef.current.onerror = (event: any) => {
      setError(`Speech recognition error: ${event.error}`);
    };
    
    recognitionRef.current.onend = () => {
      // If we're still in recording state but recognition ended, restart it
      if (isRecording && recognitionRef.current) {
        recognitionRef.current.start();
      } else {
        setIsRecording(false);
      }
    };
    
    return () => {
      // Cleanup
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [options.continuous, options.interimResults, options.language, isRecording]);
  
  // Start recording
  const startRecording = useCallback(() => {
    setError(null);
    try {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsRecording(true);
      }
    } catch (err) {
      setError(`Error starting recognition: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);
  
  // Stop recording
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, []);
  
  // Reset transcript
  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);
  
  return {
    transcript,
    isRecording,
    error,
    startRecording,
    stopRecording,
    resetTranscript
  };
};

export default useSpeechRecognition; 