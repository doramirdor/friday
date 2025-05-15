import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Play, Pause, Bold, Italic, Link as LinkIcon, ChevronRight, ChevronDown, Maximize, Minimize, Mic, Square, ToggleRight, ToggleLeft, Volume2, VolumeX } from "lucide-react";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotes } from "@/hooks/useNotes";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import useSpeechRecognition from "@/hooks/useSpeechRecognition";
import useGoogleSpeech from "@/hooks/useGoogleSpeech";
import { Toggle } from "@/components/ui/toggle";
import { Slider } from "@/components/ui/slider";
import useSystemAudio from "@/hooks/useSystemAudio";
import useSystemAudioRecording from "@/hooks/useSystemAudioRecording";
import { AudioTestButton } from "@/components/audio-test-button";
import { Switch } from "@/components/ui/switch";

interface TranscriptLine {
  id: string;
  text: string;
  speakerId: string;
  isEditing?: boolean;
}

interface Speaker {
  id: string;
  name: string;
  color: string;
}

interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
}

interface Context {
  id: string;
  name: string;
  files: string[];
  overrideGlobal: boolean;
}

interface MeetingState {
  title: string;
  description: string;
  tags: string[];
  createdAt: Date;
  isNew: boolean;
  liveTranscript: boolean;
}

interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    appPath?: string;
    sendMessage: (channel: string, data: unknown) => void;
    receive: (channel: string, callback: (...args: unknown[]) => void) => void;
    invokeGoogleSpeech: (audioBuffer: ArrayBuffer) => Promise<string>;
    saveAudioFile: (buffer: ArrayBuffer, filename: string, formats?: string[]) => Promise<{
      success: boolean;
      files?: Array<{format: string, path: string}>;
      filePath?: string;
      message?: string;
    }>;
  }
}

const TranscriptDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const meetingState = location.state as MeetingState | undefined;
  const { notes, setNotes, formatText } = useNotes(id || "");
  
  const [title, setTitle] = useState(meetingState?.title || "Weekly Team Standup");
  const [description, setDescription] = useState(meetingState?.description || "Discussion about current project status and next steps.");
  const [tags, setTags] = useState<string[]>(meetingState?.tags || ["meeting", "team"]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([
    { id: "a1", text: "Follow up with design team about UI changes", completed: false },
    { id: "a2", text: "Schedule retrospective for Friday", completed: true },
  ]);
  const [newActionItem, setNewActionItem] = useState("");
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLineId, setCurrentLineId] = useState("l2");
  
  const [context, setContext] = useState<Context>({
    id: "c1",
    name: "Project Redesign",
    files: ["requirements.pdf", "wireframes.fig"],
    overrideGlobal: false,
  });
  
  const [speakers, setSpeakers] = useState<Speaker[]>([
    { id: "s1", name: "Michael (You)", color: "#28C76F" },
    { id: "s2", name: "Sarah", color: "#7367F0" },
    { id: "s3", name: "David", color: "#FF9F43" },
  ]);
  
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  
  // Use different speech recognition based on environment
  const isElectron = !!(window as unknown as ElectronWindow)?.electronAPI?.isElectron;
  const googleSpeech = useGoogleSpeech();
  const webSpeech = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    language: 'en-US',
  });
  
  // Determine which speech recognition method to use
  const speech = isElectron ? googleSpeech : webSpeech;
  
  // Get the relevant state from the speech recognition hooks
  const [isRecording, setIsRecording] = useState(false);
  const [isNewMeeting, setIsNewMeeting] = useState(!!meetingState?.isNew);
  
  // State for panel visibility
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  
  // Track the current speaker for new transcripts
  const [currentSpeakerId, setCurrentSpeakerId] = useState("s1");

  // Add state for live transcript toggle
  const [isLiveTranscript, setIsLiveTranscript] = useState(meetingState?.liveTranscript || false);
  
  // Audio recording and playback references and states
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // State for recorded audio, duration and playback position
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentAudioTime, setCurrentAudioTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(80);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [savedAudioPath, setSavedAudioPath] = useState<string | null>(null);

  // Timer for recording duration
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const recordingTimerRef = useRef<number | null>(null);

  // Get the system audio hook
  const { isBlackHoleAvailable, getSystemAudioStream } = useSystemAudio();

  // Get the system audio hook
  const { 
    isAvailable: isNativeSystemAudioAvailable,
    isRecording: isNativeRecording,
    hasPermission: hasSystemAudioPermission,
    recordingPath: nativeRecordingPath,
    recordingDuration: nativeRecordingDuration,
    startRecording: startNativeRecording,
    stopRecording: stopNativeRecording
  } = useSystemAudioRecording();

  // Format time in mm:ss format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Start timer for recording duration
  const startRecordingTimer = () => {
    setRecordingDuration(0);
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);
  };
  
  // Stop timer for recording duration
  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // Set up the audio element for playback
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      // Add event listeners for audio playback
      audioRef.current.addEventListener('timeupdate', () => {
        setCurrentAudioTime(audioRef.current?.currentTime || 0);
      });
      
      audioRef.current.addEventListener('loadedmetadata', () => {
        setAudioDuration(audioRef.current?.duration || 0);
        console.log(`Audio duration: ${audioRef.current?.duration}s`);
      });
      
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
      });
      
      audioRef.current.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        toast.error('Error playing audio recording');
        setIsPlaying(false);
      });
      
      audioRef.current.addEventListener('play', () => {
        console.log('Audio playback started');
      });
      
      audioRef.current.addEventListener('pause', () => {
        console.log('Audio playback paused');
      });
    }
    
    return () => {
      if (audioRef.current) {
        // Remove all event listeners
        audioRef.current.pause();
        audioRef.current.src = '';
        
        // Revoke any object URLs to prevent memory leaks
        if (recordedAudioUrl) {
          URL.revokeObjectURL(recordedAudioUrl);
        }
        
        audioRef.current = null;
      }
    };
  }, []);
  
  // Update audio source when recorded audio URL changes
  useEffect(() => {
    if (audioRef.current && recordedAudioUrl) {
      console.log('Setting audio source:', recordedAudioUrl);
      audioRef.current.src = recordedAudioUrl;
      audioRef.current.load();
      
      // Reset audio playback state
      setCurrentAudioTime(0);
      setIsPlaying(false);
    }
  }, [recordedAudioUrl]);
  
  // Process transcript updates when speech recognition produces new text
  useEffect(() => {
    if (speech.transcript && isRecording && isLiveTranscript) {
      const transcriptText = speech.transcript.trim();
      if (transcriptText) {
        // Add the new line to the transcript
        const newLine: TranscriptLine = {
          id: `l${Date.now()}`,
          text: transcriptText,
          speakerId: currentSpeakerId,
        };

        setTranscriptLines(prevLines => {
          // Check if this is a continuation of the current speaker's text
          if (prevLines.length > 0 && prevLines[prevLines.length - 1].speakerId === currentSpeakerId) {
            // Update the last line to append the new text
            const updatedLines = [...prevLines];
            updatedLines[updatedLines.length - 1] = {
              ...updatedLines[updatedLines.length - 1],
              text: updatedLines[updatedLines.length - 1].text + ' ' + transcriptText,
            };
            return updatedLines;
          } else {
            // Add a new line
            return [...prevLines, newLine];
          }
        });

        // Reset the transcript in the speech hook to avoid duplication
        speech.resetTranscript();
      }
    }
  }, [speech.transcript, isRecording, currentSpeakerId, isLiveTranscript]);

  // Determine if we should show empty transcript area for new meeting
  useEffect(() => {
    if (meetingState?.isNew) {
      // Clear transcript lines for new meetings
      setTranscriptLines([]);
    }
  }, [meetingState?.isNew]);

  // Handle errors from speech recognition
  useEffect(() => {
    if (speech.error) {
      const errorMessage = typeof speech.error === 'string' 
        ? speech.error 
        : speech.error.message || 'Error with speech recognition';
        
      toast.error(errorMessage);
    }
  }, [speech.error]);

  // Update volume when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const handlePlayPause = () => {
    if (!recordedAudioUrl || !audioRef.current) {
      toast.error("No recorded audio available");
      return;
    }
    
    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
    } else {
        const playPromise = audioRef.current.play();
        
        // Handle play promise to catch potential errors
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
            })
            .catch(error => {
              console.error("Playback error:", error);
              toast.error("Failed to play audio");
              setIsPlaying(false);
            });
        }
      }
    } catch (err) {
      console.error("Error toggling playback:", err);
      toast.error("Playback error occurred");
      setIsPlaying(false);
    }
  };
  
  const handleStartStopRecording = useCallback(async () => {
    if (!isRecording) {
      // First, try to use native system audio recording if available
      if (isNativeSystemAudioAvailable) {
        try {
          // Generate a filename based on the meeting title
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${timestamp}`;
          
          // Start native system audio recording
          const success = await startNativeRecording({
            filename
          });
          
          if (success) {
            setIsRecording(true);
            
            // Start recording timer
            startRecordingTimer();
            
            // Start the speech recognition if needed
            if (isLiveTranscript) {
              speech.startRecording();
            }
            
            if (isNewMeeting) {
              setIsNewMeeting(false);
            }
            
            return;
          }
        } catch (error) {
          console.error("Error with native system audio recording:", error);
          // Will fall back to regular recording
        }
      }
      
      // If native system audio recording is not available or failed, fall back to MediaRecorder
      try {
        // Reset audio chunks
        audioChunksRef.current = [];
        
        // Get audio stream using our system audio hook
        const stream = await getSystemAudioStream({
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        });
        
        streamRef.current = stream;
        
        // Show feedback about audio source
        if (isBlackHoleAvailable) {
          toast.success("Recording system audio with BlackHole");
        } else {
          toast.info("Using microphone for recording");
        }
        
        // Create media recorder
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        
        // Set up event handlers
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          // Create audio blob from chunks
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: 'audio/wav' 
          });
          
          // Create URL for the blob and set it
          const audioUrl = URL.createObjectURL(audioBlob);
          setRecordedAudioUrl(audioUrl);
          
          // Save the audio file to disk if running in Electron
          const electronAPI = (window as unknown as ElectronWindow).electronAPI;
          if (isElectron && electronAPI && typeof electronAPI.saveAudioFile === 'function') {
            try {
              // Convert blob to ArrayBuffer
              const arrayBuffer = await audioBlob.arrayBuffer();
              
              // Generate filename based on meeting title or timestamp
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const baseFilename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${timestamp}`;
              
              // Save file to disk in both WAV and MP3 formats
              const result = await electronAPI.saveAudioFile(arrayBuffer, baseFilename, ['wav', 'mp3']);
              
              if (result.success) {
                // Set the primary file path (WAV) for backward compatibility
                setSavedAudioPath(result.filePath);
                
                // Create a message showing all saved formats
                if (result.files && result.files.length > 0) {
                  const formatsList = result.files.map(f => f.format.toUpperCase()).join(' and ');
                  toast.success(`Recording saved in ${formatsList} formats`);
                  
                  // Show paths to each file
                  result.files.forEach(file => {
                    toast.info(`${file.format.toUpperCase()}: ${file.path}`);
                  });
                } else {
                  toast.success(`Recording saved to ${result.filePath}`);
                }
              } else {
                toast.error(`Failed to save recording: ${result.message}`);
              }
            } catch (err) {
              console.error("Error saving audio file:", err);
              toast.error("Failed to save recording to disk");
            }
          } else {
            // Not running in Electron, just use the blob URL
            toast.info("Recording available for this session only");
          }
          
          // Send for transcription if live transcript is disabled
          if (!isLiveTranscript) {
            // Start background transcription processing
            if (isElectron && electronAPI && typeof electronAPI.invokeGoogleSpeech === 'function') {
              // Convert blob to ArrayBuffer and send to Google Speech API
              const reader = new FileReader();
              reader.readAsArrayBuffer(audioBlob);
              reader.onloadend = async () => {
                try {
                  const buffer = reader.result as ArrayBuffer;
                  const result = await electronAPI.invokeGoogleSpeech(buffer);
                  
                  // Add as a new transcript line
                  setTranscriptLines(prevLines => [
                    ...prevLines,
                    {
                      id: `l${Date.now()}`,
                      text: result,
                      speakerId: currentSpeakerId,
                    }
                  ]);
                  
                  toast.success("Audio transcription completed");
                } catch (err) {
                  toast.error("Transcription failed");
                  console.error(err);
      }
              };
    } else {
              // Use Web Speech API for transcription
              toast.info("Processing audio for transcription");
              // Here we could use a different approach for full audio transcription
              // like sending to a server or using a more powerful API
            }
          }
        };
        
        // Start recording
        mediaRecorder.start(1000); // Capture in 1-second chunks
        
        // Start the speech recognition
        speech.startRecording();
        
        // Start recording timer
        startRecordingTimer();
        
        setIsRecording(true);
        toast.success("Recording started");
        
        if (isNewMeeting) {
          setIsNewMeeting(false);
        }
      } catch (err) {
        console.error("Error starting recording:", err);
        toast.error("Failed to start recording");
      }
    } else {
      // If using native system audio recording
      if (isNativeSystemAudioAvailable && isNativeRecording) {
        await stopNativeRecording();
      } else {
        // Stop MediaRecorder
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
        }
        
        // Stop all audio tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop();
          });
          streamRef.current = null;
        }
      }
      
      // Stop the speech recognition
      speech.stopRecording();
      
      // Stop recording timer
      stopRecordingTimer();
      
      setIsRecording(false);
      toast.info("Recording stopped");
    }
  }, [
    isRecording, 
    speech, 
    isNewMeeting, 
    isElectron, 
    isLiveTranscript, 
    currentSpeakerId, 
    getSystemAudioStream, 
    isBlackHoleAvailable,
    isNativeSystemAudioAvailable,
    isNativeRecording,
    startNativeRecording,
    stopNativeRecording,
    title
  ]);
  
  // Handle audio time change (seeking)
  const handleAudioTimeChange = (value: number[]) => {
    if (audioRef.current && recordedAudioUrl) {
      audioRef.current.currentTime = value[0];
      setCurrentAudioTime(value[0]);
    }
  };
  
  // Handle volume change
  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
  };
  
  // Toggle mute
  const handleToggleMute = () => {
    setIsMuted(!isMuted);
  };
  
  const handleLineClick = (line: TranscriptLine) => {
    setTranscriptLines(
      transcriptLines.map(l => 
        l.id === line.id ? { ...l, isEditing: true } : { ...l, isEditing: false }
      )
    );
  };
  
  const handleLineEdit = (id: string, newText: string) => {
    setTranscriptLines(
      transcriptLines.map(l => 
        l.id === id ? { ...l, text: newText, isEditing: false } : l
      )
    );
  };
  
  const handleSpeakerChange = (lineId: string, speakerId: string) => {
    setTranscriptLines(
      transcriptLines.map(l => 
        l.id === lineId ? { ...l, speakerId } : l
      )
    );
  };
  
  const handleAddSpeaker = () => {
    if (newSpeakerName.trim()) {
      const colors = ["#EA5455", "#00CFE8", "#9F44D3", "#666666", "#FE9900"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      const newSpeaker: Speaker = {
        id: `s${Date.now()}`,
        name: newSpeakerName,
        color: randomColor,
      };
      
      setSpeakers([...speakers, newSpeaker]);
      setNewSpeakerName("");
      toast.success(`Added ${newSpeakerName} as a speaker`);
    }
  };
  
  const handleAddActionItem = () => {
    if (newActionItem.trim()) {
      setActionItems([
        ...actionItems,
        { id: `a${Date.now()}`, text: newActionItem, completed: false }
      ]);
      setNewActionItem("");
    }
  };
  
  const handleToggleActionItem = (id: string) => {
    setActionItems(
      actionItems.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };
  
  const handleToggleOverrideContext = () => {
    setContext({
      ...context,
      overrideGlobal: !context.overrideGlobal,
    });
  };
  
  const handleSave = () => {
    toast.success("Changes saved successfully");
  };
  
  // Toggle panel visibility
  const toggleLeftPanel = () => {
    setLeftPanelCollapsed(!leftPanelCollapsed);
  };
  
  const toggleRightPanel = () => {
    setRightPanelCollapsed(!rightPanelCollapsed);
  };

  // Determine the default sizes based on collapsed state
  const getDefaultSizes = () => {
    if (leftPanelCollapsed) return [0, 100];
    if (rightPanelCollapsed) return [100, 0];
    return [50, 50]; // Default is 50/50 split
  };
  
  // Add a function to handle speaker change during recording
  const handleCurrentSpeakerChange = (speakerId: string) => {
    setCurrentSpeakerId(speakerId);
    toast.info(`Speaker changed to ${speakers.find(s => s.id === speakerId)?.name || 'Unknown'}`);
  };

  // Toggle live transcript mode
  const handleToggleLiveTranscript = () => {
    setIsLiveTranscript(!isLiveTranscript);
    toast.info(
      !isLiveTranscript
        ? "Live transcript enabled" 
        : "Live transcript disabled"
    );
  };
  
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-background border-b border-border px-6 py-4 flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate("/library")}
          className="h-8 w-8 p-0 rounded-full"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">Back</span>
        </Button>
        
        <h1 className="text-xl font-semibold flex-1">{title}</h1>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          className="text-sm"
        >
          Save Changes
          <span className="ml-2 text-xs text-muted-foreground">⌘ S</span>
        </Button>
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup 
          direction="horizontal" 
          className="w-full"
          onLayout={(sizes) => {
            localStorage.setItem('panelSizes', JSON.stringify(sizes));
          }}
        >
          {/* Left panel (Transcript) */}
          <ResizablePanel 
            defaultSize={50} 
            minSize={15}
            maxSize={85}
            collapsible={true}
            collapsedSize={0}
            onCollapse={() => setLeftPanelCollapsed(true)}
            onExpand={() => setLeftPanelCollapsed(false)}
            className={leftPanelCollapsed ? "hidden" : ""}
          >
            <div className="flex flex-col h-full overflow-hidden">
              {/* Toggle button for left panel */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleLeftPanel}
                className="absolute left-2 top-20 z-10 h-8 w-8 p-0 rounded-full bg-accent/50"
              >
                {leftPanelCollapsed ? <ChevronRight className="h-4 w-4" /> : <Minimize className="h-4 w-4" />}
              </Button>
              
              {/* Recording controls for new meeting or Waveform player for existing */}
              <div className="p-6 border-b">
                {isNewMeeting || transcriptLines.length === 0 ? (
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
                      {isRecording ? <Square className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                    </Button>
                    <div className="text-sm font-medium">
                        {isRecording 
                          ? `Recording: ${formatTime(recordingDuration)}` 
                          : "Click to start recording"}
                      </div>
                    </div>
                    
                    {/* Add toggle for live transcript */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center space-x-2">
                        <Toggle
                          pressed={isLiveTranscript}
                          onPressedChange={handleToggleLiveTranscript}
                          aria-label="Toggle live transcript"
                        >
                          {isLiveTranscript ? 
                            <ToggleRight className="h-5 w-5" /> : 
                            <ToggleLeft className="h-5 w-5" />}
                        </Toggle>
                        <span className="text-sm font-medium">
                          {isLiveTranscript ? "Live Transcript: On" : "Live Transcript: Off"}
                        </span>
                      </div>
                    </div>
                    
                    {/* Test existing audio files */}
                    <div className="mt-4">
                      <AudioTestButton />
                    </div>
                  </div>
                ) : (
                  // Audio player controls
                  <div className="flex flex-col gap-4 mb-4">
                    <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handlePlayPause}
                      className="h-10 w-10 rounded-full"
                        disabled={!recordedAudioUrl}
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5" />
                      )}
                      <span className="sr-only">
                        {isPlaying ? "Pause" : "Play"}
                      </span>
                    </Button>
                    
                    <div className="text-sm font-medium">
                        {formatTime(currentAudioTime)} / {formatTime(audioDuration)}
                    </div>
                      
                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleToggleMute}
                          className="h-8 w-8 p-0"
                        >
                          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </Button>
                        <div className="w-20">
                          <Slider
                            value={[volume]}
                            min={0}
                            max={100}
                            step={1}
                            onValueChange={handleVolumeChange}
                          />
                  </div>
                      </div>
                    </div>
                    
                    {/* Audio scrubber */}
                    <div className="w-full">
                      <Slider
                        value={[currentAudioTime]}
                        min={0}
                        max={audioDuration || 100}
                        step={0.1}
                        onValueChange={handleAudioTimeChange}
                        disabled={!recordedAudioUrl}
                      />
                    </div>
                    
                    {/* Audio waveform visualization */}
                    {recordedAudioUrl && (
                      <div className="h-20 bg-muted rounded-md waveform-bg relative">
                        {/* Simulated waveform for now */}
                    <div className="absolute inset-0 flex items-center px-4">
                      <div className="w-full h-16 flex items-center">
                        {Array.from({ length: 100 }).map((_, i) => {
                          const height = Math.sin(i * 0.2) * 20 + 30;
                          return (
                            <div
                              key={i}
                              className="w-1 mx-0.5 bg-primary-dark opacity-70"
                              style={{
                                height: `${height}%`,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Playhead */}
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-primary"
                          style={{ 
                            left: `${(currentAudioTime / (audioDuration || 1)) * 100}%` 
                          }}
                    />
                  </div>
                )}
                    
                    {/* Button to start a new recording */}
                    <div className="flex gap-2 mt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleStartStopRecording}
                      >
                        {isRecording ? "Stop Recording" : "Record New Audio"}
                      </Button>
                      
                      {/* Add test button for existing recordings */}
                      <AudioTestButton />
                    </div>
                  </div>
                )}

                {/* Show live transcription status when recording */}
                {isRecording && (
                  <div className="mt-4 p-3 bg-accent/20 rounded-md">
                    <div className="text-sm font-medium flex items-center">
                      <div className="mr-2 h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                      Live Transcription {isLiveTranscript ? "Active" : "Disabled"}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {isElectron 
                        ? "Using Google Speech API for high accuracy" 
                        : "Using Web Speech API for transcription"}
                    </div>
                    
                    {/* Show toggle for live transcript during recording */}
                    {isRecording && (
                      <div className="flex items-center gap-2 mt-2">
                        <Toggle
                          pressed={isLiveTranscript}
                          onPressedChange={handleToggleLiveTranscript}
                          aria-label="Toggle live transcript"
                        >
                          {isLiveTranscript ? 
                            <ToggleRight className="h-4 w-4" /> : 
                            <ToggleLeft className="h-4 w-4" />}
                        </Toggle>
                        <span className="text-xs">
                          {isLiveTranscript ? "Live Transcript: On" : "Live Transcript: Off"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Transcript lines */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium">Transcript</h2>
                    {transcriptLines.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="add-speaker" className="sr-only">Add Speaker</Label>
                        <Input 
                          id="add-speaker"
                          placeholder="Add new speaker..."
                          value={newSpeakerName}
                          onChange={(e) => setNewSpeakerName(e.target.value)}
                          className="w-48"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleAddSpeaker();
                            }
                          }}
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={handleAddSpeaker}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Empty state for new meeting */}
                  {isNewMeeting || transcriptLines.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <p>No transcript available yet</p>
                      <p className="mt-2 text-sm">Start recording to begin transcription</p>
                    </div>
                  ) : (
                    transcriptLines.map((line) => (
                      <div 
                        key={line.id}
                        className={`p-2 rounded-md ${
                          line.id === currentLineId 
                            ? "bg-primary/10 border-l-2 border-primary" 
                            : "hover:bg-accent/50"
                        }`}
                        onClick={() => handleLineClick(line)}
                      >
                        {line.isEditing ? (
                          <div className="flex gap-2">
                            <select 
                              value={line.speakerId}
                              onChange={(e) => handleSpeakerChange(line.id, e.target.value)}
                              className="h-10 w-32 rounded-md border border-input bg-background px-3 text-sm"
                            >
                              {speakers.map(speaker => (
                                <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
                              ))}
                            </select>
                            <Input
                              value={line.text}
                              onChange={(e) => handleLineEdit(line.id, e.target.value)}
                              autoFocus
                              onBlur={() => {
                                setTranscriptLines(
                                  transcriptLines.map(l => 
                                    l.id === line.id ? { ...l, isEditing: false } : l
                                  )
                                );
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleLineEdit(line.id, (e.target as HTMLInputElement).value);
                                }
                              }}
                              className="flex-1"
                            />
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <span 
                              className="font-medium"
                              style={{ 
                                color: speakers.find(s => s.id === line.speakerId)?.color || "#666666",
                              }}
                            >
                              {speakers.find(s => s.id === line.speakerId)?.name}
                            </span>
                            <p className="flex-1">{line.text}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ResizablePanel>
          
          {!leftPanelCollapsed && !rightPanelCollapsed && (
            <ResizableHandle withHandle />
          )}
          
          {/* Right panel (Inspector) */}
          <ResizablePanel 
            defaultSize={50}
            minSize={15}
            maxSize={85}
            collapsible={true}
            collapsedSize={0}
            onCollapse={() => setRightPanelCollapsed(true)}
            onExpand={() => setRightPanelCollapsed(false)}
            className={rightPanelCollapsed ? "hidden" : ""}
          >
            {/* Toggle button for right panel */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleRightPanel}
              className="absolute right-2 top-20 z-10 h-8 w-8 p-0 rounded-full bg-accent/50"
            >
              {rightPanelCollapsed ? <ChevronLeft className="h-4 w-4" /> : <Minimize className="h-4 w-4" />}
            </Button>
            
            <Tabs defaultValue="details" className="w-full h-full flex flex-col">
              <TabsList className="w-full justify-start border-b rounded-none px-6 h-12">
                <TabsTrigger value="details" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Details
                </TabsTrigger>
                <TabsTrigger value="action-items" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Action Items
                </TabsTrigger>
                <TabsTrigger value="notes" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="context" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Context
                </TabsTrigger>
              </TabsList>
              
              <div className="flex-1 overflow-y-auto">
                <TabsContent value="details" className="p-6 space-y-6 h-full">
                  <div className="space-y-4">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <Label htmlFor="tags">Tags</Label>
                    <TagInput
                      id="tags"
                      tags={tags}
                      onTagsChange={setTags}
                      placeholder="Add tag..."
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="action-items" className="p-6 space-y-6 h-full">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="action-items">Action Items</Label>
                      <span className="text-sm text-muted-foreground">
                        {actionItems.filter(item => item.completed).length}/{actionItems.length} completed
                      </span>
                    </div>
                    
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {actionItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-2 p-3 border rounded-md"
                        >
                          <Checkbox
                            id={item.id}
                            checked={item.completed}
                            onCheckedChange={() => handleToggleActionItem(item.id)}
                            className="mt-1"
                          />
                          <Label
                            htmlFor={item.id}
                            className={`${
                              item.completed ? "line-through text-muted-foreground" : ""
                            } cursor-pointer text-sm flex-1`}
                          >
                            {item.text}
                          </Label>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex gap-2 pt-4">
                      <Input
                        value={newActionItem}
                        onChange={(e) => setNewActionItem(e.target.value)}
                        placeholder="Add new action item..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleAddActionItem();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={handleAddActionItem}
                        variant="outline"
                        size="sm"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="notes" className="p-6 space-y-6 h-full">
                  <div className="space-y-4">
                    <Label htmlFor="notes">Meeting Notes</Label>
                    
                    <div className="border rounded-md p-2 mb-4">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('bold')}
                          className="h-8 w-8 p-0"
                          title="Bold"
                        >
                          <Bold className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('italic')}
                          className="h-8 w-8 p-0"
                          title="Italic"
                        >
                          <Italic className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => formatText('link')}
                          className="h-8 w-8 p-0"
                          title="Link"
                        >
                          <LinkIcon className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                    
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={12}
                      placeholder="Add meeting notes here..."
                      className="resize-none"
                    />
                    
                    <div className="p-4 border rounded-md bg-accent/30">
                      <h3 className="text-sm font-medium mb-2">Preview</h3>
                      <div 
                        dangerouslySetInnerHTML={{ __html: notes.replace(/\n/g, '<br />') }}
                        className="prose prose-sm max-w-none"
                      />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="context" className="p-6 space-y-6 h-full">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="context-name">Context Name</Label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="override-global"
                          checked={context.overrideGlobal}
                          onCheckedChange={handleToggleOverrideContext}
                        />
                        <Label htmlFor="override-global" className="text-sm font-normal">
                          Override global context
                        </Label>
                      </div>
                    </div>
                    
                    <Input
                      id="context-name"
                      value={context.name}
                      onChange={(e) => setContext({ ...context, name: e.target.value })}
                      placeholder="Context name"
                    />
                    
                    <Label htmlFor="context-files">Context Files</Label>
                    <div className="border rounded-md p-4 bg-accent/20">
                      {context.files.length > 0 ? (
                        <ul className="space-y-2">
                          {context.files.map((file, index) => (
                            <li key={index} className="flex items-center justify-between">
                              <span className="text-sm">{file}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setContext({
                                    ...context,
                                    files: context.files.filter((_, i) => i !== index)
                                  });
                                }}
                                className="h-8 w-8 p-0 text-destructive"
                              >
                                <span className="sr-only">Remove</span>
                                ×
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No context files added
                        </p>
                      )}
                    </div>
                    
                    <div className="pt-2">
                      <Button variant="outline" size="sm" className="w-full">
                        Add Context Files
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default TranscriptDetails;
