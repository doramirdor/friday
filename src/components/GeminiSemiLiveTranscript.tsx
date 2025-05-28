import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Square, Sparkles, Trash2 } from 'lucide-react';
import { useGeminiSemiLive } from '@/hooks/useGeminiSemiLive';
import { GeminiSemiLiveOptions } from '@/services/gemini-semi-live';
import { cn } from '@/lib/utils';

interface GeminiSemiLiveTranscriptProps {
  maxSpeakers?: number;
  onTranscriptAdd?: (transcript: string) => void;
  className?: string;
}

const GeminiSemiLiveTranscript: React.FC<GeminiSemiLiveTranscriptProps> = ({
  maxSpeakers = 4,
  onTranscriptAdd,
  className
}) => {
  const {
    transcript,
    isRecording,
    isAvailable,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
    speakers
  } = useGeminiSemiLive();

  const [languageCode, setLanguageCode] = useState('en-US');
  const [chunkDuration, setChunkDuration] = useState(5);

  const handleStartStop = useCallback(async () => {
    if (isRecording) {
      stopRecording();
    } else {
      const options: GeminiSemiLiveOptions = {
        sampleRateHertz: 16000,
        languageCode,
        enableSpeakerDiarization: true,
        maxSpeakerCount: maxSpeakers,
        chunkDurationMs: chunkDuration * 1000,
        encoding: 'LINEAR16'
      };
      
      await startRecording(options);
    }
  }, [isRecording, startRecording, stopRecording, languageCode, maxSpeakers, chunkDuration]);

  const handleAddToMeeting = useCallback(() => {
    if (transcript && onTranscriptAdd) {
      onTranscriptAdd(transcript);
      clearTranscript();
    }
  }, [transcript, onTranscriptAdd, clearTranscript]);

  if (!isAvailable) {
    return (
      <div className={cn("p-4 border rounded-lg bg-muted", className)}>
        <div className="text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Gemini Semi-Live not available</p>
          <p className="text-sm mt-1">Please check your Gemini API key in settings</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("p-4 border rounded-lg bg-card", className)}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Gemini Semi-Live Transcript</h3>
          </div>
          <div className="text-sm text-muted-foreground">
            {speakers.length > 0 && `${speakers.length} speaker${speakers.length !== 1 ? 's' : ''} detected`}
          </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Input
              id="language"
              value={languageCode}
              onChange={(e) => setLanguageCode(e.target.value)}
              placeholder="en-US"
              disabled={isRecording}
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chunk-duration">Chunk Duration (seconds)</Label>
            <Input
              id="chunk-duration"
              type="number"
              min="3"
              max="10"
              value={chunkDuration}
              onChange={(e) => setChunkDuration(parseInt(e.target.value) || 5)}
              disabled={isRecording}
              className="text-sm"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleStartStop}
            variant={isRecording ? "destructive" : "default"}
            size="sm"
            className="flex items-center gap-2"
          >
            {isRecording ? (
              <>
                <Square className="h-4 w-4" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                Start Recording
              </>
            )}
          </Button>

          {transcript && (
            <>
              <Button
                onClick={clearTranscript}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>

              {onTranscriptAdd && (
                <Button
                  onClick={handleAddToMeeting}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Add to Meeting
                </Button>
              )}
            </>
          )}
        </div>

        {/* Status */}
        {isRecording && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Recording... (sends chunks every {chunkDuration} seconds)
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="p-3 border border-red-200 rounded-md bg-red-50">
            <p className="text-sm text-red-700">
              <strong>Error:</strong> {error.message}
            </p>
          </div>
        )}

        {/* Transcript display */}
        {transcript ? (
          <div className="space-y-3">
            <Label>Live Transcript</Label>
            <Textarea
              value={transcript}
              readOnly
              className="min-h-[200px] max-h-[400px] resize-none font-mono text-sm"
              placeholder="Transcript will appear here as you speak..."
            />
            
            {/* Speakers display */}
            {speakers.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm">Detected Speakers</Label>
                <div className="flex flex-wrap gap-2">
                  {speakers.map((speaker) => (
                    <div
                      key={speaker.id}
                      className="flex items-center gap-2 px-2 py-1 rounded-md border bg-muted"
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: speaker.color }}
                      />
                      <span className="text-sm">{speaker.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Mic className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No transcript yet</p>
            <p className="text-sm mt-1">Start recording to begin transcription</p>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Uses Gemini 2.0 Flash for high-quality transcription</p>
          <p>• Automatically detects up to {maxSpeakers} speakers</p>
          <p>• Processes audio in {chunkDuration}-second chunks for stability</p>
        </div>
      </div>
    </div>
  );
};

export default GeminiSemiLiveTranscript; 