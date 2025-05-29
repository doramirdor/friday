import { useState, useEffect, useCallback, useRef } from 'react';
import { geminiSemiLiveService, GeminiSemiLiveResult, GeminiSemiLiveOptions } from '@/services/gemini-semi-live';
import { useToast } from '@/hooks/use-toast';

interface UseGeminiSemiLiveReturn {
  transcript: string;
  isRecording: boolean;
  isAvailable: boolean;
  error: Error | null;
  startRecording: (options?: GeminiSemiLiveOptions) => Promise<void>;
  stopRecording: () => void;
  clearTranscript: () => void;
  speakers: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  speakerContext: Array<{
    id: string;
    name: string;
    color: string;
    lastSeen: number;
    totalSegments: number;
  }>;
  clearSpeakerContext: () => void;
  getSpeakerContext: () => Array<{
    id: string;
    name: string;
    color: string;
    lastSeen: number;
    totalSegments: number;
  }>;
}

export const useGeminiSemiLive = (): UseGeminiSemiLiveReturn => {
  const [transcript, setTranscript] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [speakers, setSpeakers] = useState<Array<{
    id: string;
    name: string;
    color: string;
  }>>([]);
  const [speakerContext, setSpeakerContext] = useState<Array<{
    id: string;
    name: string;
    color: string;
    lastSeen: number;
    totalSegments: number;
  }>>([]);
  
  const { toast } = useToast();
  const transcriptRef = useRef<string>('');

  // Check if Gemini Semi-Live is available
  const isAvailable = geminiSemiLiveService.isAvailable;

  // Handle Gemini results
  const handleResult = useCallback((result: GeminiSemiLiveResult) => {
    console.log('🎯 Gemini Semi-Live result:', result);
    
    // All results are final in semi-live approach
    const newText = result.transcript;
    
    // For semi-live, we append new results to build up the conversation
    if (newText && newText.trim()) {
      transcriptRef.current = transcriptRef.current 
        ? `${transcriptRef.current}\n${newText}`
        : newText;
      
      setTranscript(transcriptRef.current);
      
      // Update speakers if provided
      if (result.speakers && result.speakers.length > 0) {
        setSpeakers(prevSpeakers => {
          // Merge new speakers with existing ones
          const existingSpeakerIds = new Set(prevSpeakers.map(s => s.id));
          const newSpeakers = result.speakers!.filter(s => !existingSpeakerIds.has(s.id));
          return [...prevSpeakers, ...newSpeakers];
        });
      }

      // Update speaker context if provided
      if (result.speakerContext && result.speakerContext.length > 0) {
        setSpeakerContext(result.speakerContext);
        console.log(`📊 Speaker context updated: ${result.speakerContext.length} speakers tracked`);
      }
      
      console.log('✅ Transcript updated with new chunk:', newText);
    }
  }, []);

  // Handle Gemini errors
  const handleError = useCallback((error: Error) => {
    console.error('❌ Gemini Semi-Live error:', error);
    setError(error);
    setIsRecording(false);
    
    toast({
      title: 'Gemini Semi-Live Error',
      description: error.message,
      variant: 'destructive'
    });
  }, [toast]);

  // Set up event listeners
  useEffect(() => {
    if (!isAvailable) return;

    geminiSemiLiveService.onResult(handleResult);
    geminiSemiLiveService.onError(handleError);

    return () => {
      geminiSemiLiveService.destroy();
    };
  }, [isAvailable, handleResult, handleError]);

  // Start recording function
  const startRecording = useCallback(async (options?: GeminiSemiLiveOptions) => {
    if (!isAvailable) {
      const errorMsg = 'Gemini Semi-Live is not available';
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
      await geminiSemiLiveService.startRecording(options);
      setIsRecording(true);
      
      toast({
        title: 'Recording Started',
        description: 'Gemini Semi-Live transcription is now active',
      });
      
      console.log('✅ Gemini Semi-Live recording started successfully');
    } catch (error) {
      const err = error as Error;
      console.error('❌ Failed to start Gemini Semi-Live recording:', err);
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
      geminiSemiLiveService.stopRecording();
      setIsRecording(false);
      
      toast({
        title: 'Recording Stopped',
        description: 'Gemini Semi-Live transcription has been stopped',
      });
      
      console.log('✅ Gemini Semi-Live recording stopped');
    } catch (error) {
      console.error('❌ Failed to stop Gemini Semi-Live recording:', error);
    }
  }, [isRecording, toast]);

  // Clear transcript function
  const clearTranscript = useCallback(() => {
    setTranscript('');
    transcriptRef.current = '';
    setSpeakers([]);
    console.log('🧹 Transcript cleared');
  }, []);

  // Clear speaker context function
  const clearSpeakerContext = useCallback(() => {
    if (isAvailable) {
      geminiSemiLiveService.clearSpeakerContext();
      setSpeakerContext([]);
      setSpeakers([]);
      console.log('🧹 Speaker context cleared');
    }
  }, [isAvailable]);

  // Get speaker context function
  const getSpeakerContext = useCallback(() => {
    if (isAvailable) {
      return geminiSemiLiveService.getSpeakerContext();
    }
    return [];
  }, [isAvailable]);

  // Sync recording state with service
  useEffect(() => {
    setIsRecording(geminiSemiLiveService.isRecording);
  }, []);

  return {
    transcript,
    isRecording,
    isAvailable,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
    speakers,
    speakerContext,
    clearSpeakerContext,
    getSpeakerContext
  };
}; 