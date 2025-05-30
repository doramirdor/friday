import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Mic, MicOff, Trash2 } from 'lucide-react';
import { useGoogleLiveTranscript } from '@/hooks/useGoogleLiveTranscript';
import { Alert, AlertDescription } from './ui/alert';

export default function GoogleLiveTranscriptNew() {
  const {
    isAvailable,
    isRecording,
    transcript,
    speakers,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
  } = useGoogleLiveTranscript();

  const [languageCode, setLanguageCode] = useState('en-US');
  const [enableSpeakerDiarization, setEnableSpeakerDiarization] = useState(true);
  const [maxSpeakers, setMaxSpeakers] = useState('4');
  const [encoding, setEncoding] = useState<'LINEAR16' | 'WEBM_OPUS' | 'MP3'>('MP3');

  const handleStartStop = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording({
        languageCode,
        enableSpeakerDiarization,
        maxSpeakers: parseInt(maxSpeakers),
        encoding,
        sampleRateHertz: 44100,
      });
    }
  };

  if (!isAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Google Live Transcript</CardTitle>
          <CardDescription>
            Google Live Transcript is not available. Please check that you have a valid Google Speech API key configured.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Google Live Transcript
            <Badge variant={isRecording ? "default" : "secondary"}>
              {isRecording ? "Recording" : "Stopped"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Real-time speech transcription using Google Cloud Speech-to-Text (1 second chunks)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Controls */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={languageCode} onValueChange={setLanguageCode} disabled={isRecording}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                  <SelectItem value="es-ES">Spanish</SelectItem>
                  <SelectItem value="fr-FR">French</SelectItem>
                  <SelectItem value="de-DE">German</SelectItem>
                  <SelectItem value="ja-JP">Japanese</SelectItem>
                  <SelectItem value="ko-KR">Korean</SelectItem>
                  <SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="encoding">Audio Encoding</Label>
              <Select value={encoding} onValueChange={(value) => setEncoding(value as 'LINEAR16' | 'WEBM_OPUS' | 'MP3')} disabled={isRecording}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LINEAR16">LINEAR16 (recommended)</SelectItem>
                  <SelectItem value="WEBM_OPUS">WEBM_OPUS</SelectItem>
                  <SelectItem value="MP3">MP3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="speaker-diarization"
              checked={enableSpeakerDiarization}
              onCheckedChange={setEnableSpeakerDiarization}
              disabled={isRecording}
            />
            <Label htmlFor="speaker-diarization">Enable Speaker Diarization</Label>
          </div>

          {enableSpeakerDiarization && (
            <div className="space-y-2">
              <Label htmlFor="max-speakers">Max Speakers</Label>
              <Select value={maxSpeakers} onValueChange={setMaxSpeakers} disabled={isRecording}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="6">6</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Separator />

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleStartStop}
              variant={isRecording ? "destructive" : "default"}
              size="sm"
            >
              {isRecording ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {isRecording ? "Stop Recording" : "Start Recording"}
            </Button>
            
            <Button
              onClick={clearTranscript}
              variant="outline"
              size="sm"
              disabled={!transcript}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Speakers */}
          {speakers.length > 0 && (
            <div className="space-y-2">
              <Label>Detected Speakers</Label>
              <div className="flex flex-wrap gap-2">
                {speakers.map((speaker) => (
                  <Badge key={speaker.id} style={{ backgroundColor: speaker.color, color: 'white' }}>
                    {speaker.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transcript Display */}
      {transcript && (
        <Card>
          <CardHeader>
            <CardTitle>Live Transcript</CardTitle>
            <CardDescription>Real-time transcription results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm">{transcript}</pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 