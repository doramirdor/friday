import React, { useCallback, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import { useGoogleLiveStable } from '@/hooks/useGoogleLiveStable';
import { GoogleLiveStableResult } from '@/services/google-live-stable';

interface GoogleLiveStableProps {
  maxSpeakers?: number;
  onTranscriptAdd: (transcript: string) => void;
  className?: string;
}

export const GoogleLiveStable: React.FC<GoogleLiveStableProps> = ({
  maxSpeakers = 4,
  onTranscriptAdd,
  className = ""
}) => {
  const [accumulatedTranscript, setAccumulatedTranscript] = useState<string>('');
  
  const handleTranscriptResult = useCallback((result: GoogleLiveStableResult) => {
    console.log('📝 Google Live Stable transcript result:', result);
    
    if (result.transcript && result.transcript.trim()) {
      // Add to accumulated transcript
      setAccumulatedTranscript(prev => {
        const newTranscript = prev + (prev ? '\n' : '') + result.transcript;
        
        // Also call the parent callback for immediate transcript processing
        onTranscriptAdd(result.transcript);
        
        return newTranscript;
      });
    }
  }, [onTranscriptAdd]);

  const {
    isRecording,
    isAvailable,
    latestResult,
    error,
    startRecording,
    stopRecording,
    clearTranscript
  } = useGoogleLiveStable(handleTranscriptResult);

  const handleStartStopRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      // Clear previous accumulated transcript when starting new recording
      setAccumulatedTranscript('');
      clearTranscript();
      
      await startRecording({
        languageCode: 'en-US',
        enableSpeakerDiarization: true,
        maxSpeakers: maxSpeakers,
        chunkDurationMs: 1000 // 1-second chunks for fast response
      });
    }
  }, [isRecording, startRecording, stopRecording, clearTranscript, maxSpeakers]);

  const handleClearTranscript = useCallback(() => {
    setAccumulatedTranscript('');
    clearTranscript();
  }, [clearTranscript]);

  if (!isAvailable) {
    return (
      <div className={`flex flex-col items-center gap-4 p-4 border rounded-lg bg-yellow-50 ${className}`}>
        <div className="flex items-center gap-2 text-yellow-700">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Google Live Stable Not Available</span>
        </div>
        <p className="text-xs text-yellow-600 text-center">
          Please set your GOOGLE_SPEECH_API_KEY environment variable to enable Google Live Transcript.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 p-4 border rounded-lg bg-blue-50 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-blue-900">Google Live Stable</h3>
          <Badge variant={isRecording ? "destructive" : "secondary"}>
            {isRecording ? "Recording" : "Ready"}
          </Badge>
        </div>
        
        {/* Recording controls */}
        <div className="flex items-center gap-2">
          <Button
            variant={isRecording ? "destructive" : "default"}
            size="sm"
            onClick={handleStartStopRecording}
            className="flex items-center gap-2"
            disabled={!isAvailable}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {isRecording ? "Stop" : "Start"}
          </Button>
          
          {accumulatedTranscript && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearTranscript}
              className="text-xs"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Latest result info */}
      {latestResult && (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <span>Latest:</span>
          {latestResult.confidence && (
            <Badge variant="outline" className="text-xs">
              {Math.round(latestResult.confidence * 100)}% confidence
            </Badge>
          )}
          {latestResult.speakers && latestResult.speakers.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {latestResult.speakers.length} speaker{latestResult.speakers.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      )}

      {/* Speakers display */}
      {latestResult?.speakers && latestResult.speakers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {latestResult.speakers.map((speaker) => (
            <Badge
              key={speaker.id}
              variant="outline"
              style={{ borderColor: speaker.color, color: speaker.color }}
              className="text-xs"
            >
              {speaker.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Live transcript display */}
      {accumulatedTranscript && (
        <div className="p-3 bg-white border rounded text-sm max-h-32 overflow-y-auto">
          <div className="text-xs text-gray-500 mb-1">Live Transcript:</div>
          <div className="whitespace-pre-wrap text-gray-800">
            {accumulatedTranscript}
          </div>
        </div>
      )}

      {/* Help text */}
      <div className="text-xs text-blue-600">
        <p>
          🎤 <strong>Stable File-Based Processing:</strong> Records 1-second audio chunks and processes them via Google Cloud Speech API with speaker diarization.
          This approach prevents system crashes that occur with real-time streaming.
        </p>
      </div>
    </div>
  );
}; 