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
 * TranscriptDetails component that uses the layered architecture
 * This component focuses on the UI and delegates business logic to hooks
 */
interface TranscriptDetailsProps {
  initialMeetingState?: MeetingState;
}

const TranscriptDetails: React.FC<TranscriptDetailsProps> = ({ initialMeetingState }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const meetingState = initialMeetingState || location.state as MeetingState | undefined;
  
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
  const [description, setDescription] = useState(meetingState?.description || "");
  const [tags, setTags] = useState<string[]>(meetingState?.tags || []);
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
          googleSpeech.startRecording();
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
          {/* Left panel - Recording controls and Meeting details */}
          <div className="md:col-span-1 border rounded-md p-4 flex flex-col">
            <h2 className="text-lg font-medium mb-4">Meeting Info</h2>
            
            {/* Meeting details */}
            <div className="mb-4 pb-4 border-b">
              <p className="text-sm text-muted-foreground mb-2">Title</p>
              <p className="font-medium">{title}</p>
              
              {description && (
                <>
                  <p className="text-sm text-muted-foreground mt-3 mb-2">Description</p>
                  <p className="text-sm">{description}</p>
                </>
              )}
              
              {tags.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, index) => (
                      <span 
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-secondary text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Recording controls */}
            <h2 className="text-lg font-medium mb-4">Recording</h2>
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
                <h3 className="text-sm font-medium mb-2">Speakers</h3>
                <div className="space-y-2">
                  {speakers.map((speaker) => (
                    <div 
                      key={speaker.id}
                      className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${
                        currentSpeakerId === speaker.id ? "bg-secondary" : "hover:bg-secondary/50"
                      }`}
                      onClick={() => handleChangeSpeaker(speaker.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: speaker.color }}
                      />
                      <span className="text-sm">{speaker.name}</span>
                    </div>
                  ))}
                  {/* Add new speaker button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const name = prompt("Enter speaker name");
                      if (name) {
                        const newSpeaker = handleAddNewSpeaker(name);
                        if (newSpeaker) {
                          setCurrentSpeakerId(newSpeaker.id);
                        }
                      }
                    }}
                  >
                    + Add Speaker
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          {/* Center panel - Transcript */}
          <div className="md:col-span-2 border rounded-md flex flex-col overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-lg font-medium">Transcript</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {isTranscriptLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Loading transcript...</p>
                </div>
              ) : transcriptLines.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No transcript yet. Start recording to begin.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transcriptLines.map((line) => {
                    const speaker = speakers.find(s => s.id === line.speakerId);
                    return (
                      <div key={line.id} className="group">
                        <div className="flex items-start gap-2">
                          <div
                            className="w-3 h-3 mt-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: speaker?.color || '#666666' }}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{speaker?.name || 'Unknown'}</p>
                            <p className="text-sm">{line.text}</p>
                          </div>
                          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                            {new Date(line.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {recordedAudioUrl && (
              <div className="p-4 border-t">
                <AudioPlayer
                  audioUrl={recordedAudioUrl}
                  autoPlay={false}
                  showWaveform={true}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// Set default props
TranscriptDetails.defaultProps = {
  initialMeetingState: undefined
};

export default TranscriptDetails; 