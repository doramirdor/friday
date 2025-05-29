import { useState, useEffect, useCallback, useRef } from 'react';
import geminiLiveUnified, { GeminiLiveOptions, GeminiLiveResult, GeminiLiveStats } from '@/services/gemini-live-unified';
import { useToast } from '@/hooks/use-toast';

interface UseGeminiLiveUnifiedReturn {
  transcript: string;
  isRecording: boolean;
  isAvailable: boolean;
  error: Error | null;
  stats: GeminiLiveStats;
  startRecording: (options?: GeminiLiveOptions) => Promise<void>;
  stopRecording: () => Promise<void>;
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
  setSpeakerContextTimeout: (timeoutMs: number) => void;
}

export const useGeminiLiveUnified = (): UseGeminiLiveUnifiedReturn => {
  const [transcript, setTranscript] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<GeminiLiveStats>(geminiLiveUnified.getStats());
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
  
  // Check if Gemini Live is available
  const isAvailable = geminiLiveUnified.isAvailable;

  // Handle Gemini results
  const handleResult = useCallback((result: GeminiLiveResult) => {
    console.log('🎯 Unified Gemini Live result:', result);
    
    const newText = result.transcript;
    
    // For live transcription, we append new results to build up the conversation
    if (newText && newText.trim()) {
      // Update UI immediately for real-time feel
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
    console.error('❌ Unified Gemini Live error:', error);
    setError(error);
    setIsRecording(false);
    
    toast({
      title: 'Gemini Live Error',
      description: error.message,
      variant: 'destructive'
    });
  }, [toast]);

  // Update stats periodically
  useEffect(() => {
    const statsInterval = setInterval(() => {
      setStats(geminiLiveUnified.getStats());
      setIsRecording(geminiLiveUnified.isStreaming);
    }, 1000);

    return () => clearInterval(statsInterval);
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!isAvailable) return;

    geminiLiveUnified.onResult(handleResult);
    geminiLiveUnified.onError(handleError);

    return () => {
      geminiLiveUnified.destroy();
    };
  }, [isAvailable, handleResult, handleError]);

  // Start recording function
  const startRecording = useCallback(async (options?: GeminiLiveOptions) => {
    if (!isAvailable) {
      const errorMsg = 'Unified Gemini Live is not available';
      setError(new Error(errorMsg));
      toast({
        title: 'Service Unavailable',
        description: 'Check Gemini API key, browser support, and Electron APIs',
        variant: 'destructive'
      });
      return;
    }

    try {
      setError(null);
      await geminiLiveUnified.startRecording(options);
      setIsRecording(true);
      
      toast({
        title: 'Live Transcription Started',
        description: 'Unified Gemini Live transcription is now active',
      });
      
      console.log('✅ Unified Gemini Live recording started successfully');
    } catch (error) {
      const err = error as Error;
      console.error('❌ Failed to start Unified Gemini Live recording:', err);
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
  const stopRecording = useCallback(async () => {
    if (!isRecording) return;

    try {
      const results = await geminiLiveUnified.stopRecording();
      setIsRecording(false);
      
      toast({
        title: 'Recording Stopped',
        description: `Processed ${results.length} audio chunks`,
      });
      
      console.log('✅ Unified Gemini Live recording stopped');
    } catch (error) {
      console.error('❌ Failed to stop Unified Gemini Live recording:', error);
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
      geminiLiveUnified.clearSpeakerContext();
      setSpeakerContext([]);
      setSpeakers([]);
      console.log('🧹 Speaker context cleared');
    }
  }, [isAvailable]);

  // Set speaker context timeout
  const setSpeakerContextTimeout = useCallback((timeoutMs: number) => {
    if (isAvailable) {
      geminiLiveUnified.setSpeakerContextTimeout(timeoutMs);
    }
  }, [isAvailable]);

  return {
    transcript,
    isRecording,
    isAvailable,
    error,
    stats,
    startRecording,
    stopRecording,
    clearTranscript,
    speakers,
    speakerContext,
    clearSpeakerContext,
    setSpeakerContextTimeout
  };
}; 