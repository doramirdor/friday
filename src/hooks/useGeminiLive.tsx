import { useState, useEffect, useCallback, useRef } from 'react';
import { geminiLiveService, GeminiLiveResult, GeminiLiveOptions } from '@/services/gemini-live';
import { toast } from 'sonner';

interface SpeakerSegment {
  speakerTag: number;
  text: string;
  isTyping: boolean;
  isComplete: boolean;
}

interface UseGeminiLiveReturn {
  transcript: string;
  segments: SpeakerSegment[];
  isStreaming: boolean;
  isAvailable: boolean;
  error: Error | null;
  startStreaming: (options?: GeminiLiveOptions) => Promise<void>;
  stopStreaming: () => void;
  clearTranscript: () => void;
  currentSpeaker: number | null;
}

export const useGeminiLive = (): UseGeminiLiveReturn => {
  const [transcript, setTranscript] = useState<string>('');
  const [segments, setSegments] = useState<SpeakerSegment[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<number | null>(null);
  
  // Refs for managing typing animation
  const typingTimeouts = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const speakerBuffers = useRef<Map<number, string>>(new Map());
  
  // Check if Gemini Live is available
  const isAvailable = geminiLiveService.isAvailable;

  // Typing animation function
  const animateTyping = useCallback((speakerTag: number, targetText: string, isPartial: boolean) => {
    // Clear any existing timeout for this speaker
    const existingTimeout = typingTimeouts.current.get(speakerTag);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Get current text for this speaker
    const currentText = speakerBuffers.current.get(speakerTag) || '';
    
    // If the text hasn't changed, don't animate
    if (currentText === targetText) {
      return;
    }

    // Update the buffer
    speakerBuffers.current.set(speakerTag, targetText);

    // Find the difference between current and target text
    const commonLength = Math.min(currentText.length, targetText.length);
    let divergencePoint = 0;
    
    for (let i = 0; i < commonLength; i++) {
      if (currentText[i] !== targetText[i]) {
        break;
      }
      divergencePoint = i + 1;
    }

    // Get the new text to animate
    const newText = targetText.substring(divergencePoint);
    const baseText = targetText.substring(0, divergencePoint);
    
    if (newText.length === 0) {
      // No new text to animate, just update the segment
      setSegments(prev => {
        const updated = [...prev];
        const segmentIndex = updated.findIndex(s => s.speakerTag === speakerTag);
        
        if (segmentIndex >= 0) {
          updated[segmentIndex] = {
            ...updated[segmentIndex],
            text: targetText,
            isTyping: isPartial,
            isComplete: !isPartial
          };
        } else {
          updated.push({
            speakerTag,
            text: targetText,
            isTyping: isPartial,
            isComplete: !isPartial
          });
        }
        
        return updated;
      });
      return;
    }

    // Animate character by character
    let currentIndex = 0;
    const animateNextChar = () => {
      if (currentIndex < newText.length) {
        const partialText = baseText + newText.substring(0, currentIndex + 1);
        
        setSegments(prev => {
          const updated = [...prev];
          const segmentIndex = updated.findIndex(s => s.speakerTag === speakerTag);
          
          if (segmentIndex >= 0) {
            updated[segmentIndex] = {
              ...updated[segmentIndex],
              text: partialText,
              isTyping: true,
              isComplete: false
            };
          } else {
            updated.push({
              speakerTag,
              text: partialText,
              isTyping: true,
              isComplete: false
            });
          }
          
          return updated;
        });

        currentIndex++;
        
        // Schedule next character with random delay for natural typing effect
        const delay = Math.random() * 20 + 30; // 30-50ms delay
        const timeout = setTimeout(animateNextChar, delay);
        typingTimeouts.current.set(speakerTag, timeout);
      } else {
        // Animation complete
        setSegments(prev => {
          const updated = [...prev];
          const segmentIndex = updated.findIndex(s => s.speakerTag === speakerTag);
          
          if (segmentIndex >= 0) {
            updated[segmentIndex] = {
              ...updated[segmentIndex],
              text: targetText,
              isTyping: isPartial,
              isComplete: !isPartial
            };
          }
          
          return updated;
        });
        
        typingTimeouts.current.delete(speakerTag);
      }
    };

    // Start the animation
    animateNextChar();
  }, []);

  // Handle Gemini Live results
  const handleResult = useCallback((result: GeminiLiveResult) => {
    console.log('🎯 Gemini Live result:', result);
    
    // Update current speaker
    if (result.speakerTag !== undefined) {
      setCurrentSpeaker(result.speakerTag);
    }

    // Animate the typing effect
    if (result.speakerTag !== undefined) {
      animateTyping(result.speakerTag, result.transcript, !result.isFinal);
    }

    // Update the full transcript
    if (result.isFinal) {
      setTranscript(prev => {
        const lines = prev.split('\n').filter(line => line.trim());
        const speakerName = `Speaker ${result.speakerTag || 'Unknown'}`;
        const newLine = `**${speakerName}:** ${result.transcript}`;
        
        // Check if this is a continuation of the same speaker
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          const lastSpeakerMatch = lastLine.match(/^\*\*Speaker (\d+)\*\*:/);
          
          if (lastSpeakerMatch && parseInt(lastSpeakerMatch[1]) === result.speakerTag) {
            // Same speaker, append to the last line
            lines[lines.length - 1] = `**${speakerName}:** ${lastLine.replace(/^\*\*Speaker \d+\*\*:\s*/, '')} ${result.transcript}`;
          } else {
            // Different speaker, add new line
            lines.push(newLine);
          }
        } else {
          // First line
          lines.push(newLine);
        }
        
        return lines.join('\n');
      });
    }
  }, [animateTyping]);

  // Handle Gemini Live errors
  const handleError = useCallback((error: Error) => {
    console.error('❌ Gemini Live error:', error);
    setError(error);
    setIsStreaming(false);
    
    toast.error(`Gemini Live Error: ${error.message}`);
  }, []);

  // Setup event listeners
  useEffect(() => {
    geminiLiveService.onResult(handleResult);
    geminiLiveService.onError(handleError);

    // Cleanup function
    return () => {
      geminiLiveService.cleanup();
    };
  }, [handleResult, handleError]);

  // Start streaming
  const startStreaming = useCallback(async (options?: GeminiLiveOptions) => {
    if (!isAvailable) {
      const errorMsg = 'Gemini Live is not available. Please check your API key and browser compatibility.';
      setError(new Error(errorMsg));
      toast.error(errorMsg);
      return;
    }

    if (isStreaming) {
      console.warn('⚠️ Gemini Live is already streaming');
      return;
    }

    try {
      setError(null);
      setIsStreaming(true);
      
      await geminiLiveService.startStreaming(options);
      
      toast.success('Gemini Live transcription started! Speak into your microphone.');
      
      console.log('✅ Gemini Live streaming started successfully');
    } catch (error) {
      console.error('❌ Failed to start Gemini Live:', error);
      setIsStreaming(false);
      setError(error instanceof Error ? error : new Error(String(error)));
      
      // Provide more specific guidance for API key errors
      const isApiKeyError = error instanceof Error && error.message.includes('API key');
      
      toast.error(
        isApiKeyError 
          ? 'Gemini API key not configured. Please add your API key in settings.'
          : error instanceof Error ? error.message : String(error)
      );
    }
  }, [isAvailable, isStreaming]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (!isStreaming) {
      return;
    }

    try {
      geminiLiveService.stopStreaming();
      setIsStreaming(false);
      
      // Clear all typing timeouts
      typingTimeouts.current.forEach(timeout => clearTimeout(timeout));
      typingTimeouts.current.clear();
      
      // Mark all segments as complete
      setSegments(prev => prev.map(segment => ({
        ...segment,
        isTyping: false,
        isComplete: true
      })));
      
      toast.success('Gemini Live transcription stopped');
      
      console.log('✅ Gemini Live streaming stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop Gemini Live:', error);
      setError(error instanceof Error ? error : new Error(String(error)));
    }
  }, [isStreaming]);

  // Clear transcript
  const clearTranscript = useCallback(() => {
    setTranscript('');
    setSegments([]);
    setCurrentSpeaker(null);
    setError(null);
    
    // Clear all typing timeouts
    typingTimeouts.current.forEach(timeout => clearTimeout(timeout));
    typingTimeouts.current.clear();
    speakerBuffers.current.clear();
  }, []);

  // Update streaming state based on service state
  useEffect(() => {
    const checkStreamingState = () => {
      setIsStreaming(geminiLiveService.isStreaming);
    };

    // Check immediately
    checkStreamingState();

    // Set up periodic check (in case state gets out of sync)
    const interval = setInterval(checkStreamingState, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    transcript,
    segments,
    isStreaming,
    isAvailable,
    error,
    startStreaming,
    stopStreaming,
    clearTranscript,
    currentSpeaker
  };
}; 