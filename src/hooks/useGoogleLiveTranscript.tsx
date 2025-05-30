import { useState, useCallback, useRef, useEffect } from 'react';
import { googleLiveTranscript, GoogleLiveTranscriptOptions, GoogleLiveTranscriptResult } from '@/services/google-live-transcript';

export interface UseGoogleLiveTranscriptReturn {
  isAvailable: boolean;
  isRecording: boolean;
  transcript: string;
  speakers: Array<{ id: string; name: string; color: string }>;
  error: string | null;
  latestResult: GoogleLiveTranscriptResult | null;
  startRecording: (options?: GoogleLiveTranscriptOptions) => Promise<void>;
  stopRecording: () => void;
  clearTranscript: () => void;
}

export const useGoogleLiveTranscript = (): UseGoogleLiveTranscriptReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speakers, setSpeakers] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<GoogleLiveTranscriptResult | null>(null);
  
  const transcriptRef = useRef('');

  const handleResult = useCallback((result: GoogleLiveTranscriptResult) => {
    console.log('🎯 Google Live result:', result);
    
    // Store the latest result for component to process
    setLatestResult(result);
    
    // Append new transcript with proper formatting
    if (result.transcript) {
      const formattedResult = result.transcript.trim();
      if (formattedResult) {
        const currentTranscript = transcriptRef.current.trim();
        const newTranscript = currentTranscript 
          ? currentTranscript + '\n' + formattedResult
          : formattedResult;
        
        transcriptRef.current = newTranscript;
        setTranscript(newTranscript);
      }
    }
    
    // Update speakers
    if (result.speakers) {
      setSpeakers(prevSpeakers => {
        const existingSpeakers = new Set(prevSpeakers.map(s => s.id));
        const newSpeakers = result.speakers!.filter(s => !existingSpeakers.has(s.id));
        return [...prevSpeakers, ...newSpeakers];
      });
    }
  }, []);

  const handleError = useCallback((err: Error) => {
    console.error('❌ Google Live error:', err);
    setError(err.message);
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async (options?: GoogleLiveTranscriptOptions) => {
    try {
      setError(null);
      setLatestResult(null);
      await googleLiveTranscript.startRecording(options);
      setIsRecording(true);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      console.error('Failed to start Google Live recording:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    googleLiveTranscript.stopRecording();
    setIsRecording(false);
    setLatestResult(null);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setSpeakers([]);
    setLatestResult(null);
    transcriptRef.current = '';
    setError(null);
  }, []);

  // Set up event listeners
  useEffect(() => {
    googleLiveTranscript.onResult(handleResult);
    googleLiveTranscript.onError(handleError);
    
    return () => {
      googleLiveTranscript.stopRecording();
    };
  }, [handleResult, handleError]);

  return {
    isAvailable: googleLiveTranscript.isAvailable,
    isRecording,
    transcript,
    speakers,
    error,
    latestResult,
    startRecording,
    stopRecording,
    clearTranscript,
  };
}; 