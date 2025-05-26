import { useState, useEffect, useCallback, useRef } from 'react';
import { streamingSpeechService, StreamingSpeechResult, StreamingSpeechOptions } from '@/services/streaming-speech';
import { useToast } from '@/hooks/use-toast';

interface UseStreamingSpeechReturn {
  transcript: string;
  interimTranscript: string;
  isStreaming: boolean;
  isAvailable: boolean;
  error: Error | null;
  startStreaming: (options?: StreamingSpeechOptions) => Promise<void>;
  stopStreaming: () => void;
  clearTranscript: () => void;
  confidence: number | null;
  speakerId: string | null;
}

export const useStreamingSpeech = (): UseStreamingSpeechReturn => {
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const finalTranscriptRef = useRef<string>('');

  // Check if streaming speech is available
  const isAvailable = streamingSpeechService.isAvailable;

  // Handle streaming results
  const handleResult = useCallback((result: StreamingSpeechResult) => {
    console.log('🎯 Streaming result:', result);
    
    if (result.isFinal) {
      // Final result - add to permanent transcript
      const newFinalText = result.transcript;
      finalTranscriptRef.current = finalTranscriptRef.current 
        ? `${finalTranscriptRef.current} ${newFinalText}`
        : newFinalText;
      
      setTranscript(finalTranscriptRef.current);
      setInterimTranscript(''); // Clear interim text
      
      // Update confidence and speaker info
      if (result.confidence !== undefined) {
        setConfidence(result.confidence);
      }
      if (result.speakerId) {
        setSpeakerId(result.speakerId);
      }
      
      console.log('✅ Final transcript updated:', newFinalText);
    } else {
      // Interim result - show as temporary text
      setInterimTranscript(result.transcript);
      console.log('🔄 Interim transcript:', result.transcript);
    }
  }, []);

  // Handle streaming errors
  const handleError = useCallback((error: Error) => {
    console.error('❌ Streaming speech error:', error);
    setError(error);
    setIsStreaming(false);
    
    toast({
      title: 'Streaming Error',
      description: error.message,
      variant: 'destructive'
    });
  }, [toast]);

  // Setup event listeners
  useEffect(() => {
    streamingSpeechService.onResult(handleResult);
    streamingSpeechService.onError(handleError);

    // Cleanup function
    return () => {
      streamingSpeechService.cleanup();
    };
  }, [handleResult, handleError]);

  // Start streaming
  const startStreaming = useCallback(async (options?: StreamingSpeechOptions) => {
    if (!isAvailable) {
      const errorMsg = 'Streaming speech recognition is not available';
      setError(new Error(errorMsg));
      toast({
        title: 'Not Available',
        description: errorMsg,
        variant: 'destructive'
      });
      return;
    }

    if (isStreaming) {
      console.warn('⚠️ Streaming is already active');
      return;
    }

    try {
      setError(null);
      setIsStreaming(true);
      
      await streamingSpeechService.startStreaming(options);
      
      toast({
        title: 'Live Transcription Started',
        description: 'Speak into your microphone for real-time transcription',
        variant: 'default'
      });
      
      console.log('✅ Streaming started successfully');
    } catch (error) {
      console.error('❌ Failed to start streaming:', error);
      setIsStreaming(false);
      setError(error instanceof Error ? error : new Error(String(error)));
      
      toast({
        title: 'Failed to Start',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive'
      });
    }
  }, [isAvailable, isStreaming, toast]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (!isStreaming) {
      return;
    }

    try {
      streamingSpeechService.stopStreaming();
      setIsStreaming(false);
      setInterimTranscript(''); // Clear any remaining interim text
      
      toast({
        title: 'Live Transcription Stopped',
        description: 'Streaming has been stopped',
        variant: 'default'
      });
      
      console.log('✅ Streaming stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop streaming:', error);
      setError(error instanceof Error ? error : new Error(String(error)));
    }
  }, [isStreaming, toast]);

  // Clear transcript
  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    finalTranscriptRef.current = '';
    setConfidence(null);
    setSpeakerId(null);
    setError(null);
  }, []);

  // Update streaming state based on service state
  useEffect(() => {
    const checkStreamingState = () => {
      setIsStreaming(streamingSpeechService.isStreaming);
    };

    // Check immediately
    checkStreamingState();

    // Set up periodic check (in case state gets out of sync)
    const interval = setInterval(checkStreamingState, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    transcript,
    interimTranscript,
    isStreaming,
    isAvailable,
    error,
    startStreaming,
    stopStreaming,
    clearTranscript,
    confidence,
    speakerId
  };
}; 