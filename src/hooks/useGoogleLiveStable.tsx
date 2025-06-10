import { useCallback, useEffect, useState } from 'react';
import { googleLiveStableService, GoogleLiveStableOptions, GoogleLiveStableResult } from '@/services/google-live-stable';

interface UseGoogleLiveStableReturn {
  isRecording: boolean;
  isAvailable: boolean;
  latestResult: GoogleLiveStableResult | null;
  error: string | null;
  startRecording: (options?: GoogleLiveStableOptions) => Promise<void>;
  stopRecording: () => Promise<void>;
  clearTranscript: () => void;
}

export const useGoogleLiveStable = (
  onTranscript?: (result: GoogleLiveStableResult) => void
): UseGoogleLiveStableReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [latestResult, setLatestResult] = useState<GoogleLiveStableResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Update state based on service state
  useEffect(() => {
    const updateState = () => {
      const state = googleLiveStableService.getCurrentState();
      setIsRecording(state.isRecording);
      setIsAvailable(state.isAvailable);
    };

    // Update immediately
    updateState();

    // Set up periodic updates (every 500ms)
    const interval = setInterval(updateState, 500);

    return () => clearInterval(interval);
  }, []);

  const handleTranscriptResult = useCallback((result: GoogleLiveStableResult) => {
    setLatestResult(result);
    setError(null);
    
    // Call external callback if provided
    if (onTranscript) {
      onTranscript(result);
    }
  }, [onTranscript]);

  const startRecording = useCallback(async (options: GoogleLiveStableOptions = {}) => {
    try {
      setError(null);
      await googleLiveStableService.startRecording(options, handleTranscriptResult);
      setIsRecording(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      setIsRecording(false);
      console.error('❌ Google Live Stable recording failed:', err);
    }
  }, [handleTranscriptResult]);

  const stopRecording = useCallback(async () => {
    try {
      await googleLiveStableService.stopRecording();
      setIsRecording(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop recording';
      setError(errorMessage);
      console.error('❌ Error stopping Google Live Stable recording:', err);
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setLatestResult(null);
    setError(null);
  }, []);

  return {
    isRecording,
    isAvailable,
    latestResult,
    error,
    startRecording,
    stopRecording,
    clearTranscript
  };
}; 