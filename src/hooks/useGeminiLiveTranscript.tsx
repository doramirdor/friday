import { useState, useCallback, useRef, useEffect } from 'react';
import { geminiLiveTranscript, GeminiLiveTranscriptOptions, GeminiLiveTranscriptResult } from '@/services/gemini-live-transcript';

export interface UseGeminiLiveTranscriptReturn {
  isAvailable: boolean;
  isRecording: boolean;
  transcript: string;
  speakers: Array<{ id: string; name: string; color: string }>;
  error: string | null;
  startRecording: (options?: GeminiLiveTranscriptOptions) => Promise<void>;
  stopRecording: () => void;
  clearTranscript: () => void;
}

export const useGeminiLiveTranscript = (): UseGeminiLiveTranscriptReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speakers, setSpeakers] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  
  const transcriptRef = useRef('');

  const handleResult = useCallback((result: GeminiLiveTranscriptResult) => {
    console.log('🎯 Gemini Live result:', result);
    
    // Append new transcript
    if (result.transcript) {
      const newTranscript = transcriptRef.current + '\n' + result.transcript;
      transcriptRef.current = newTranscript;
      setTranscript(newTranscript);
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
    console.error('❌ Gemini Live error:', err);
    setError(err.message);
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async (options?: GeminiLiveTranscriptOptions) => {
    try {
      setError(null);
      await geminiLiveTranscript.startRecording(options);
      setIsRecording(true);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      console.error('Failed to start Gemini Live recording:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    geminiLiveTranscript.stopRecording();
    setIsRecording(false);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setSpeakers([]);
    transcriptRef.current = '';
    setError(null);
  }, []);

  // Set up event listeners
  useEffect(() => {
    geminiLiveTranscript.onResult(handleResult);
    geminiLiveTranscript.onError(handleError);
    
    return () => {
      geminiLiveTranscript.stopRecording();
    };
  }, [handleResult, handleError]);

  return {
    isAvailable: geminiLiveTranscript.isAvailable,
    isRecording,
    transcript,
    speakers,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
  };
}; 