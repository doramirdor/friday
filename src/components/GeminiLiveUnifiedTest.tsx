import React from 'react';
import { useGeminiLiveUnified } from '@/hooks/useGeminiLiveUnified';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

const GeminiLiveUnifiedTest: React.FC = () => {
  const {
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
  } = useGeminiLiveUnified();

  const handleStart = () => {
    startRecording({
      chunkDurationMs: 2000, // 2 seconds for responsive testing
      enableSpeakerDiarization: true,
      maxSpeakers: 4,
      processingMode: 'continuous'
    });
  };

  const handleStartBatch = () => {
    startRecording({
      chunkDurationMs: 3000, // 3 seconds for batch testing
      enableSpeakerDiarization: true,
      maxSpeakers: 4,
      processingMode: 'send-at-end'
    });
  };

  if (!isAvailable) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-red-600">Unified Gemini Live - Not Available</CardTitle>
          <CardDescription>
            Service unavailable. Please check:
            <ul className="list-disc list-inside mt-2">
              <li>Gemini API key is configured in settings</li>
              <li>Browser supports audio recording</li>
              <li>Electron APIs are available</li>
            </ul>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🎯 Unified Gemini Live Test
            <Badge variant={isAvailable ? "default" : "destructive"}>
              {isAvailable ? "Available" : "Unavailable"}
            </Badge>
            <Badge variant={isRecording ? "destructive" : "secondary"}>
              {isRecording ? "Recording" : "Stopped"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Test the unified live transcription using proven Gemini tools and file-based approach.
            This service reuses our existing working transcribeAudio method for reliability.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleStart} 
              disabled={isRecording}
              variant="default"
            >
              🎤 Start Continuous (2s chunks)
            </Button>
            <Button 
              onClick={handleStartBatch} 
              disabled={isRecording}
              variant="outline"
            >
              📦 Start Batch Mode (3s chunks)
            </Button>
            <Button 
              onClick={stopRecording} 
              disabled={!isRecording}
              variant="destructive"
            >
              ⏹️ Stop Recording
            </Button>
            <Button 
              onClick={clearTranscript}
              variant="ghost"
            >
              🧹 Clear Transcript
            </Button>
            <Button 
              onClick={clearSpeakerContext}
              variant="ghost"
            >
              🗑️ Clear Speakers
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>📊 Live Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Mode:</strong> {stats.processingMode}
              </div>
              <div>
                <strong>Chunk Duration:</strong> {stats.chunkDurationMs}ms
              </div>
              <div>
                <strong>Chunks Collected:</strong> {stats.audioChunksCollected}
              </div>
              <div>
                <strong>Chunks Processed:</strong> {stats.chunksProcessed}
              </div>
              <div>
                <strong>Total Processing Time:</strong> {stats.totalProcessingTime}ms
              </div>
              <div>
                <strong>Current Buffer Size:</strong> {stats.currentChunkSize}
              </div>
              <div>
                <strong>Last Processed:</strong> {
                  stats.lastProcessedTime > 0 
                    ? new Date(stats.lastProcessedTime).toLocaleTimeString() 
                    : 'Never'
                }
              </div>
              <div>
                <strong>Avg Processing Time:</strong> {
                  stats.chunksProcessed > 0 
                    ? Math.round(stats.totalProcessingTime / stats.chunksProcessed) + 'ms'
                    : 'N/A'
                }
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Speaker Context */}
        <Card>
          <CardHeader>
            <CardTitle>👥 Speaker Context ({speakerContext.length})</CardTitle>
            <CardDescription>
              Active speaker tracking with 5-minute timeout
            </CardDescription>
          </CardHeader>
          <CardContent>
            {speakerContext.length > 0 ? (
              <div className="space-y-2">
                {speakerContext.map((speaker) => (
                  <div 
                    key={speaker.id} 
                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: speaker.color }}
                      />
                      <span className="font-medium">{speaker.name}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {speaker.totalSegments} segments • {
                        Math.round((Date.now() - speaker.lastSeen) / 1000)
                      }s ago
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <Button 
                    onClick={() => setSpeakerContextTimeout(2 * 60 * 1000)}
                    size="sm"
                    variant="outline"
                  >
                    2min timeout
                  </Button>
                  <Button 
                    onClick={() => setSpeakerContextTimeout(5 * 60 * 1000)}
                    size="sm"
                    variant="outline"
                  >
                    5min timeout
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No active speakers</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Current Speakers */}
      {speakers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🗣️ Current Session Speakers ({speakers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {speakers.map((speaker) => (
                <Badge 
                  key={speaker.id}
                  style={{ backgroundColor: speaker.color, color: 'white' }}
                >
                  {speaker.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle>📝 Live Transcript</CardTitle>
          <CardDescription>
            Real-time transcription using proven Gemini transcribeAudio method
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64 w-full rounded border p-4">
            {transcript ? (
              <div className="whitespace-pre-wrap text-sm">
                {transcript}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                {isRecording 
                  ? "Listening for audio... Start speaking to see transcription."
                  : "No transcript yet. Start recording to begin transcription."
                }
              </p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Technical Info */}
      <Card>
        <CardHeader>
          <CardTitle>🔧 Technical Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div><strong>Approach:</strong> File-based semi-live using proven tools</div>
          <div><strong>Audio Processing:</strong> 16kHz mono WAV chunks</div>
          <div><strong>Transcription:</strong> Reuses existing geminiService.transcribeAudio()</div>
          <div><strong>File Management:</strong> Temporary files with automatic cleanup</div>
          <div><strong>Speaker Diarization:</strong> Built into Gemini transcription</div>
          <div><strong>Error Handling:</strong> Robust with fallbacks and cleanup</div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GeminiLiveUnifiedTest; 