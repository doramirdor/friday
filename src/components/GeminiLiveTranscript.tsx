import React from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Sparkles } from 'lucide-react';
import { useGeminiLive } from '@/hooks/useGeminiLive';
import { GeminiLiveOptions } from '@/services/gemini-live';

interface GeminiLiveTranscriptProps {
  maxSpeakers?: number;
  onTranscriptAdd?: (transcript: string) => void;
  className?: string;
}

const GeminiLiveTranscript: React.FC<GeminiLiveTranscriptProps> = ({
  maxSpeakers = 4,
  onTranscriptAdd,
  className = ''
}) => {
  const {
    transcript,
    segments,
    isStreaming,
    isAvailable,
    error,
    startStreaming,
    stopStreaming,
    clearTranscript,
    currentSpeaker
  } = useGeminiLive();

  const handleStartStop = async () => {
    if (isStreaming) {
      try {
        stopStreaming();
      } catch (error) {
        console.error('Error stopping Gemini Live:', error);
        // Don't show error toast for stop failures, just log them
      }
    } else {
      try {
        const options: GeminiLiveOptions = {
          sampleRateHertz: 16000,
          encoding: 'LINEAR16',
          enableSpeakerDiarization: true,
          maxSpeakerCount: maxSpeakers,
          languageCode: 'en-US'
        };
        
        await startStreaming(options);
      } catch (error) {
        console.error('Error starting Gemini Live:', error);
        // Error handling is done in the hook, no need to show additional toast
      }
    }
  };

  const handleAddToTranscript = () => {
    if (transcript && onTranscriptAdd) {
      onTranscriptAdd(transcript);
      clearTranscript();
    }
  };

  const getSpeakerColor = (speakerTag: number): string => {
    const colors = [
      '#28C76F', // Green
      '#7367F0', // Purple
      '#FF9F43', // Orange
      '#EA5455', // Red
      '#00CFE8', // Cyan
      '#9F44D3', // Violet
      '#666666', // Gray
      '#FE9900'  // Amber
    ];
    return colors[speakerTag % colors.length];
  };

  if (!isAvailable) {
    return (
      <div className={`p-4 border rounded-lg bg-gray-50 ${className}`}>
        <div className="text-center text-gray-600">
          <Sparkles className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="font-medium">Gemini Live Not Available</p>
          <p className="text-sm mt-1">
            Please check your Gemini API key configuration and browser compatibility.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          <h3 className="font-semibold text-purple-900">Gemini Live Transcript</h3>
          {currentSpeaker !== null && (
            <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
              Speaker {currentSpeaker}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={isStreaming ? "destructive" : "default"}
            size="sm"
            onClick={handleStartStop}
            className="flex items-center gap-2"
          >
            {isStreaming ? (
              <>
                <Square className="h-4 w-4" />
                Stop Live
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                Start Live
              </>
            )}
          </Button>
          
          {isStreaming && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearTranscript}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Live transcript display */}
      <div className="min-h-[200px] max-h-[400px] overflow-y-auto">
        {segments.length > 0 ? (
          <div className="space-y-3">
            {segments.map((segment, index) => (
              <div
                key={`${segment.speakerTag}-${index}`}
                className="flex items-start gap-3 p-3 rounded-lg bg-white/70 backdrop-blur-sm border border-white/50"
              >
                {/* Speaker indicator */}
                <div 
                  className="w-3 h-3 rounded-full mt-2 flex-shrink-0"
                  style={{ backgroundColor: getSpeakerColor(segment.speakerTag) }}
                />
                
                <div className="flex-1 min-w-0">
                  {/* Speaker name */}
                  <div className="flex items-center gap-2 mb-1">
                    <span 
                      className="text-sm font-medium"
                      style={{ color: getSpeakerColor(segment.speakerTag) }}
                    >
                      Speaker {segment.speakerTag}
                    </span>
                    {segment.isTyping && (
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse" />
                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse delay-75" />
                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse delay-150" />
                      </div>
                    )}
                  </div>
                  
                  {/* Transcript text with typing animation */}
                  <div className="text-sm leading-relaxed">
                    <span className={segment.isTyping ? 'text-gray-700' : 'text-gray-900'}>
                      {segment.text}
                    </span>
                    {segment.isTyping && (
                      <span className="inline-block w-2 h-4 bg-purple-500 ml-1 animate-pulse" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            {isStreaming ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse delay-75" />
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse delay-150" />
                </div>
                <p className="text-sm">Listening for speech...</p>
                <p className="text-xs text-gray-400 mt-1">Speak into your microphone</p>
              </div>
            ) : (
              <div className="text-center">
                <Mic className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Click "Start Live" to begin real-time transcription</p>
                <p className="text-xs text-gray-400 mt-1">Powered by Gemini Live</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status and actions */}
      {(transcript || error) && (
        <div className="border-t pt-4">
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">Error</p>
              <p className="text-xs text-red-600 mt-1">{error.message}</p>
            </div>
          )}
          
          {transcript && (
            <div className="space-y-3">
              {/* Final transcript preview */}
              <div className="p-3 bg-white/50 border border-gray-200 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-2">Final Transcript:</p>
                <div 
                  className="text-sm text-gray-800 max-h-20 overflow-y-auto"
                  dangerouslySetInnerHTML={{ 
                    __html: transcript.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />') 
                  }}
                />
              </div>
              
              {/* Add to meeting button */}
              {onTranscriptAdd && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddToTranscript}
                  className="w-full"
                >
                  Add to Meeting Transcript
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GeminiLiveTranscript; 