import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Square, Sparkles, Trash2, Users, Clock } from 'lucide-react';
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
    speakers,
    speakerContext,
    clearSpeakerContext
  } = useGeminiSemiLive();

  const [languageCode, setLanguageCode] = useState('en-US');
  const [chunkDuration, setChunkDuration] = useState(1);
  const [maintainSpeakerContext, setMaintainSpeakerContext] = useState(true);
  const [speakerContextTimeout, setSpeakerContextTimeout] = useState(5);
  const [processingMode, setProcessingMode] = useState<'continuous' | 'send-at-end'>('continuous');

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
        encoding: 'LINEAR16',
        maintainSpeakerContext,
        speakerContextTimeoutMs: speakerContextTimeout * 60 * 1000, // Convert minutes to milliseconds
        processingMode
      };
      
      await startRecording(options);
    }
  }, [isRecording, startRecording, stopRecording, languageCode, maxSpeakers, chunkDuration, maintainSpeakerContext, speakerContextTimeout, processingMode]);

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
            <Label htmlFor="processing-mode">Processing Mode</Label>
            <select
              id="processing-mode"
              value={processingMode}
              onChange={(e) => setProcessingMode(e.target.value as 'continuous' | 'send-at-end')}
              disabled={isRecording}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="continuous">Continuous (every {chunkDuration}s)</option>
              <option value="send-at-end">Send at End (no database conflicts)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="chunk-duration">Chunk Duration (seconds)</Label>
            <Input
              id="chunk-duration"
              type="number"
              min="1"
              max="10"
              value={chunkDuration}
              onChange={(e) => setChunkDuration(parseInt(e.target.value) || 1)}
              disabled={isRecording || processingMode === 'send-at-end'}
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chunk-duration" className="text-sm text-muted-foreground">
              {processingMode === 'continuous' 
                ? `Processes audio every ${chunkDuration} seconds` 
                : 'Processes all audio when recording stops'
              }
            </Label>
          </div>
        </div>

        {/* Speaker Context Settings */}
        <div className="space-y-3 p-3 border rounded-md bg-muted/50">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Speaker Context Settings</Label>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="maintain-speaker-context"
                checked={maintainSpeakerContext}
                onChange={(e) => setMaintainSpeakerContext(e.target.checked)}
                disabled={isRecording}
                className="rounded"
              />
              <Label htmlFor="maintain-speaker-context" className="text-sm">
                Maintain speaker context
              </Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="speaker-timeout" className="text-sm">Context timeout (minutes)</Label>
              <Input
                id="speaker-timeout"
                type="number"
                min="1"
                max="60"
                value={speakerContextTimeout}
                onChange={(e) => setSpeakerContextTimeout(parseInt(e.target.value) || 5)}
                disabled={isRecording || !maintainSpeakerContext}
                className="text-sm"
              />
            </div>
          </div>
          
          {speakerContext.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Active Speaker Context ({speakerContext.length})</Label>
                <Button
                  onClick={clearSpeakerContext}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={isRecording}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear Context
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {speakerContext.map((speaker) => (
                  <div
                    key={speaker.id}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs border bg-background"
                    title={`${speaker.totalSegments} segments, last seen ${Math.round((Date.now() - speaker.lastSeen) / 1000)}s ago`}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: speaker.color }}
                    />
                    <span>{speaker.name}</span>
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{speaker.totalSegments}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
          {maintainSpeakerContext && (
            <p>• Maintains speaker context across chunks for {speakerContextTimeout} minutes</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeminiSemiLiveTranscript; 