import { useState, useEffect, useCallback, useRef } from 'react';
import { semiLiveSpeechService, SemiLiveSpeechResult, SemiLiveSpeechOptions } from '@/services/semi-live-speech';
import { useToast } from '@/hooks/use-toast';

interface UseSemiLiveSpeechReturn {
  transcript: string;
  isRecording: boolean;
  isAvailable: boolean;
  error: Error | null;
  startRecording: (options?: SemiLiveSpeechOptions) => Promise<void>;
  stopRecording: () => void;
  clearTranscript: () => void;
  confidence: number | null;
  speakerId: string | null;
}

export const useSemiLiveSpeech = (): UseSemiLiveSpeechReturn => {
  const [transcript, setTranscript] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const transcriptRef = useRef<string>('');

  // Check if semi-live speech is available
  const isAvailable = semiLiveSpeechService.isAvailable;

  // Handle speech results
  const handleResult = useCallback((result: SemiLiveSpeechResult) => {
    console.log('🎯 Semi-live result:', result);
    
    // All results are final in semi-live approach
    const newText = result.transcript;
    transcriptRef.current = transcriptRef.current 
      ? `${transcriptRef.current} ${newText}`
      : newText;
    
    setTranscript(transcriptRef.current);
    
    // Update confidence and speaker info
    if (result.confidence !== undefined) {
      setConfidence(result.confidence);
    }
    if (result.speakerId) {
      setSpeakerId(result.speakerId);
    }
    
    console.log('✅ Transcript updated:', newText);
  }, []);

  // Handle speech errors
  const handleError = useCallback((error: Error) => {
    console.error('❌ Semi-live speech error:', error);
    setError(error);
    setIsRecording(false);
    
    toast({
      title: 'Speech Recognition Error',
      description: error.message,
      variant: 'destructive'
    });
  }, [toast]);

  // Set up event listeners
  useEffect(() => {
    if (!isAvailable) return;

    semiLiveSpeechService.onResult(handleResult);
    semiLiveSpeechService.onError(handleError);

    return () => {
      semiLiveSpeechService.cleanup();
    };
  }, [isAvailable, handleResult, handleError]);

  // Start recording function
  const startRecording = useCallback(async (options?: SemiLiveSpeechOptions) => {
    if (!isAvailable) {
      const errorMsg = 'Semi-live speech recognition is not available';
      setError(new Error(errorMsg));
      toast({
        title: 'Service Unavailable',
        description: errorMsg,
        variant: 'destructive'
      });
      return;
    }

    try {
      setError(null);
      await semiLiveSpeechService.startRecording(options);
      setIsRecording(true);
      
      toast({
        title: 'Recording Started',
        description: 'Semi-live speech recognition is now active',
      });
      
      console.log('✅ Semi-live recording started successfully');
    } catch (error) {
      const err = error as Error;
      console.error('❌ Failed to start semi-live recording:', err);
      setError(err);
      setIsRecording(false);
      
      toast({
        title: 'Failed to Start Recording',
        description: err.message,
        variant: 'destructive'
      });
    }
  }, [isAvailable, toast]);

  // Stop recording function
  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    try {
      semiLiveSpeechService.stopRecording();
      setIsRecording(false);
      
      toast({
        title: 'Recording Stopped',
        description: 'Semi-live speech recognition has been stopped',
      });
      
      console.log('✅ Semi-live recording stopped');
    } catch (error) {
      console.error('❌ Failed to stop semi-live recording:', error);
    }
  }, [isRecording, toast]);

  // Clear transcript function
  const clearTranscript = useCallback(() => {
    setTranscript('');
    transcriptRef.current = '';
    setConfidence(null);
    setSpeakerId(null);
    console.log('🧹 Transcript cleared');
  }, []);

  // Sync recording state with service
  useEffect(() => {
    setIsRecording(semiLiveSpeechService.isRecording);
  }, []);

  return {
    transcript,
    isRecording,
    isAvailable,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
    confidence,
    speakerId
  };
}; 