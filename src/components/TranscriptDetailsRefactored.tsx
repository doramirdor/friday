import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import useTranscript, { TranscriptLine, Speaker } from '@/hooks/useTranscript';
import useMicrophoneRecording from '@/hooks/useMicrophoneRecording';
import useSystemAudioRecording from '@/hooks/useSystemAudioRecording';
import useCombinedRecording from '@/hooks/useCombinedRecording';
import useSettings from '@/hooks/useSettings';
import useGoogleSpeech from '@/hooks/useGoogleSpeech';
import AudioPlayer from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';

interface MeetingState {
  title: string;
  description: string;
  tags: string[];
  createdAt: Date;
  isNew: boolean;
  liveTranscript: boolean;
}

// Define constants for recording sources
type RecordingSource = 'system' | 'mic' | 'both';

/**
 * Refactored TranscriptDetails component that uses the new layered architecture
 * This component focuses on the UI and delegates business logic to hooks
 */
const TranscriptDetailsRefactored: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const meetingState = location.state as MeetingState | undefined;
  
  // Setup hooks
  const { settings } = useSettings();
  const [recordingSource, setRecordingSource] = useState<RecordingSource>(
    settings?.recordingSource || 'system'
  );
  
  // Get meeting ID or generate a new one
  const meetingId = id || `meeting_${Date.now()}`;
  
  // Use our transcript hook
  const {
    transcriptLines,
    speakers,
    isLoading: isTranscriptLoading,
    error: transcriptError,
    addTranscriptLine,
    updateTranscriptLine,
    deleteTranscriptLine,
    addSpeaker,
    updateSpeaker,
    deleteSpeaker,
    saveTranscript
  } = useTranscript(meetingId);
  
  // Initialize recording hooks
  const { 
    isAvailable: isSystemAvailable,
    isRecording: isSystemRecording, 
    startRecording: startSystemRecording,
    stopRecording: stopSystemRecording,
    recordingPath: systemRecordingPath,
    recordingDuration: systemRecordingDuration 
  } = useSystemAudioRecording();
  
  const { 
    isAvailable: isMicAvailable,
    isRecording: isMicRecording, 
    startRecording: startMicRecording,
    stopRecording: stopMicRecording,
    recordingPath: micRecordingPath,
    recordingDuration: micRecordingDuration 
  } = useMicrophoneRecording();
  
  const { 
    isAvailable: isCombinedAvailable,
    isRecording: isCombinedRecording, 
    startRecording: startCombinedRecording,
    stopRecording: stopCombinedRecording,
    recordingPath: combinedRecordingPath,
    recordingDuration: combinedRecordingDuration 
  } = useCombinedRecording();
  
  // Speech recognition for transcription
  const googleSpeech = useGoogleSpeech();
  
  // Local state
  const [title, setTitle] = useState(meetingState?.title || "New Meeting");
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isLiveTranscript, setIsLiveTranscript] = useState(
    meetingState?.liveTranscript !== undefined
      ? meetingState.liveTranscript
      : settings?.liveTranscript || false
  );
  
  // Initialize speakers if empty
  useEffect(() => {
    if (speakers.length === 0) {
      // Add a default speaker
      addSpeaker({
        name: "You",
        color: "#28C76F"
      });
    } else {
      // Set the first speaker as current
      setCurrentSpeakerId(speakers[0].id);
    }
  }, [addSpeaker, speakers]);
  
  // Effect to handle speech recognition results
  useEffect(() => {
    if (isRecording && isLiveTranscript && googleSpeech.transcript && currentSpeakerId) {
      // Add the transcript to our lines
      addTranscriptLine({
        text: googleSpeech.transcript,
        speakerId: currentSpeakerId,
        timestamp: Date.now()
      });
      
      // Reset the transcript in the speech hook to avoid duplication
      googleSpeech.resetTranscript();
    }
  }, [
    isRecording, 
    isLiveTranscript, 
    googleSpeech.transcript, 
    currentSpeakerId, 
    addTranscriptLine, 
    googleSpeech.resetTranscript
  ]);
  
  // Effect to update recording path when any recording completes
  useEffect(() => {
    const path = systemRecordingPath || micRecordingPath || combinedRecordingPath;
    
    if (path && path !== recordingPath) {
      setRecordingPath(path);
      
      // Load the audio for playback
      loadAudioFile(path);
    }
  }, [systemRecordingPath, micRecordingPath, combinedRecordingPath, recordingPath]);
  
  // Effect to update recording duration from active recording source
  useEffect(() => {
    let duration = 0;
    
    if (isSystemRecording) {
      duration = systemRecordingDuration;
    } else if (isMicRecording) {
      duration = micRecordingDuration;
    } else if (isCombinedRecording) {
      duration = combinedRecordingDuration;
    }
    
    setRecordingDuration(duration);
  }, [
    isSystemRecording, 
    isMicRecording, 
    isCombinedRecording,
    systemRecordingDuration,
    micRecordingDuration,
    combinedRecordingDuration
  ]);
  
  // Helper function to load audio file for playback
  const loadAudioFile = useCallback(async (filePath: string) => {
    // In Electron environment, we need to use IPC to load the file
    const win = window as any;
    
    if (win?.electronAPI?.loadAudioFile) {
      try {
        const result = await win.electronAPI.loadAudioFile(filePath);
        
        if (result.success && result.dataUrl) {
          setRecordedAudioUrl(result.dataUrl);
          toast.success('Audio loaded successfully');
        } else {
          console.error('Error loading audio:', result.error);
          toast.error(`Failed to load audio: ${result.error}`);
        }
      } catch (error) {
        console.error('Error loading audio file:', error);
        toast.error('Failed to load audio file');
      }
    }
  }, []);
  
  // Start/stop recording based on current source
  const handleStartStopRecording = useCallback(async () => {
    const isCurrentlyRecording = 
      isSystemRecording || 
      isMicRecording || 
      isCombinedRecording;
    
    if (isCurrentlyRecording) {
      // Stop the active recording
      if (isSystemRecording) {
        await stopSystemRecording();
      } else if (isMicRecording) {
        await stopMicRecording();
      } else if (isCombinedRecording) {
        await stopCombinedRecording();
      }
      
      setIsRecording(false);
    } else {
      // Start a new recording
      let success = false;
      
      if (recordingSource === 'system' && isSystemAvailable) {
        success = await startSystemRecording();
      } else if (recordingSource === 'mic' && isMicAvailable) {
        success = await startMicRecording();
      } else if (recordingSource === 'both' && isCombinedAvailable) {
        success = await startCombinedRecording();
      }
      
      if (success) {
        setIsRecording(true);
        
        // Start speech recognition if live transcript is enabled
        if (isLiveTranscript) {
          googleSpeech.startListening();
        }
      } else {
        toast.error(`Failed to start ${recordingSource} recording`);
      }
    }
  }, [
    isSystemRecording, 
    isMicRecording, 
    isCombinedRecording,
    recordingSource,
    isSystemAvailable,
    isMicAvailable,
    isCombinedAvailable,
    startSystemRecording,
    startMicRecording,
    startCombinedRecording,
    stopSystemRecording,
    stopMicRecording,
    stopCombinedRecording,
    isLiveTranscript,
    googleSpeech
  ]);
  
  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Toggle live transcript
  const handleToggleLiveTranscript = useCallback(() => {
    setIsLiveTranscript(prev => !prev);
    
    // Update settings if needed
    // (Implement this part using your settings logic)
  }, []);
  
  // Change the current speaker
  const handleChangeSpeaker = useCallback((speakerId: string) => {
    setCurrentSpeakerId(speakerId);
  }, []);
  
  // Add a new speaker
  const handleAddNewSpeaker = useCallback((name: string) => {
    if (!name.trim()) return;
    
    const colors = ["#EA5455", "#00CFE8", "#9F44D3", "#666666", "#FE9900"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const newSpeaker = addSpeaker({
      name,
      color: randomColor
    });
    
    toast.success(`Added ${name} as a speaker`);
    return newSpeaker;
  }, [addSpeaker]);
  
  // Save transcript to file
  const handleSaveTranscript = useCallback(async () => {
    const result = await saveTranscript();
    
    if (result.success) {
      toast.success('Transcript saved successfully');
    }
  }, [saveTranscript]);
  
  // Render the component
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-background border-b border-border px-6 py-4 flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate(-1)}
          className="h-8 w-8 p-0 rounded-full"
        >
          <span className="sr-only">Back</span>
        </Button>
        
        <h1 className="text-xl font-semibold flex-1">{title}</h1>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveTranscript}
          className="text-sm"
        >
          Save Transcript
        </Button>
      </header>
      
      <main className="flex-1 overflow-hidden p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
          {/* Left panel - Recording controls */}
          <div className="md:col-span-1 border rounded-md p-4 flex flex-col">
            <h2 className="text-lg font-medium mb-4">Recording</h2>
            
            {/* Recording controls */}
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex items-center justify-center mb-4 space-x-2">
                <Button
                  variant={isRecording ? "destructive" : "default"}
                  size="lg"
                  onClick={handleStartStopRecording}
                  className={`h-16 w-16 rounded-full flex items-center justify-center ${
                    isRecording ? "animate-pulse" : ""
                  }`}
                >
                  {isRecording ? "■" : "●"}
                </Button>
                <div className="text-sm font-medium">
                  {isRecording ? 
                    `Recording: ${formatTime(recordingDuration)}` : 
                    "Click to start recording"
                  }
                </div>
              </div>
              
              {/* Recording source selector */}
              <div className="flex items-center gap-2 mt-4">
                <label className="text-sm font-medium">Recording source:</label>
                <div className="flex space-x-1">
                  <Button
                    variant={recordingSource === 'system' ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRecordingSource('system')}
                    disabled={isRecording}
                  >
                    System
                  </Button>
                  <Button
                    variant={recordingSource === 'mic' ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRecordingSource('mic')}
                    disabled={isRecording}
                  >
                    Mic
                  </Button>
                  <Button
                    variant={recordingSource === 'both' ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRecordingSource('both')}
                    disabled={isRecording}
                  >
                    Both
                  </Button>
                </div>
              </div>
              
              {/* Live transcript toggle */}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center space-x-2">
                  <Button
                    variant={isLiveTranscript ? "default" : "outline"}
                    size="sm"
                    onClick={handleToggleLiveTranscript}
                  >
                    {isLiveTranscript ? "Live Transcript: On" : "Live Transcript: Off"}
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Speaker selector */}
            {speakers.length > 0 && (
              <div className="mt-auto">
                <h3 className="text-sm font-medium mb-2">Current Speaker</h3>
                <div className="flex flex-wrap gap-2">
                  {speakers.map(speaker => (
                    <Button
                      key={speaker.id}
                      variant={currentSpeakerId === speaker.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleChangeSpeaker(speaker.id)}
                      style={{ 
                        borderColor: speaker.color,
                        backgroundColor: currentSpeakerId === speaker.id ? speaker.color : 'transparent',
                        color: currentSpeakerId === speaker.id ? 'white' : speaker.color
                      }}
                    >
                      {speaker.name}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const name = prompt('Enter speaker name');
                      if (name) handleAddNewSpeaker(name);
                    }}
                  >
                    + Add
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          {/* Center panel - Transcript */}
          <div className="md:col-span-2 border rounded-md p-4 flex flex-col">
            <h2 className="text-lg font-medium mb-4">Transcript</h2>
            
            {/* Audio player */}
            {recordedAudioUrl && (
              <div className="mb-4">
                <AudioPlayer
                  audioUrl={recordedAudioUrl}
                  autoPlay={false}
                  showWaveform={true}
                />
              </div>
            )}
            
            {/* Transcript lines */}
            <div className="flex-1 overflow-y-auto">
              {transcriptLines.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <p>No transcript available yet</p>
                  <p className="mt-2 text-sm">Start recording to begin transcription</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transcriptLines.map((line) => (
                    <div 
                      key={line.id}
                      className="p-2 rounded-md hover:bg-accent/50"
                    >
                      <div className="flex gap-2">
                        <span 
                          className="font-medium"
                          style={{ 
                            color: speakers.find(s => s.id === line.speakerId)?.color || "#666666",
                          }}
                        >
                          {speakers.find(s => s.id === line.speakerId)?.name || "Unknown"}:
                        </span>
                        <p className="flex-1">{line.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TranscriptDetailsRefactored; 