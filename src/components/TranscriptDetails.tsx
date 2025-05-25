import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Play, Pause, Bold, Italic, Link as LinkIcon, ChevronRight, ChevronDown, Maximize, Minimize, Mic, Square, ToggleRight, ToggleLeft, Volume2, VolumeX, Laptop, Headphones } from "lucide-react";
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
import { DatabaseService } from '@/services/database';
import { 
  Meeting, 
  ActionItem as DBActionItem, 
  Notes as DBNotes, 
  Context as DBContext,
  TranscriptLine as DBTranscriptLine,
  Speaker as DBSpeaker
} from '@/models/types';
import { useSettings } from "@/hooks/useSettings";
import useMicrophoneRecording from "@/hooks/useMicrophoneRecording";
import useSystemAudioRecording from "@/hooks/useSystemAudioRecording";
import useCombinedRecording from "@/hooks/useCombinedRecording";
import AudioPlayer from "@/components/AudioPlayer";

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
    sendMessage: (channel: string, data: unknown) => void;
    receive: (channel: string, callback: (...args: unknown[]) => void) => void;
    invokeGoogleSpeech: (audioBuffer: ArrayBuffer) => Promise<string>;
  }
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
    { id: "1", name: "Speaker 1", color: "#28C76F" },
    { id: "2", name: "Speaker 2", color: "#7367F0" },
    { id: "3", name: "Speaker 3", color: "#FF9F43" },
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

  // Add state for live transcript toggle - default to false
  const [isLiveTranscript, setIsLiveTranscript] = useState(false);
  
  // Audio recording and playback references and states
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // State for recorded audio, duration and playback position
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [filePathUrl, setFilePathUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentAudioTime, setCurrentAudioTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(80);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Timer for recording duration
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const recordingTimerRef = useRef<number | null>(null);
  
  // Setup hooks
  const { settings, updateSettings } = useSettings();
  const [recordingSource, setRecordingSource] = useState<RecordingSource>(
    settings?.recordingSource || 'system'
  );
  
  // Get meeting ID or generate a new one
  const meetingId = id || `meeting_${Date.now()}`;
  
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

  // Update isRecording state based on any active recording
  useEffect(() => {
    setIsRecording(isSystemRecording || isMicRecording || isCombinedRecording);
  }, [isSystemRecording, isMicRecording, isCombinedRecording]);
  
  // Initialize speakers if empty
  useEffect(() => {
    if (speakers.length === 0) {
      // Add a default speaker
      // addSpeaker({
      //   name: "You",
      //   color: "#28C76F"
      // });
    } else {
      // Set the first speaker as current
      setCurrentSpeakerId(speakers[0].id);
    }
  }, [// addSpeaker, 
    speakers]);
  
  // Effect to handle speech recognition results
  useEffect(() => {
    if (isRecording && isLiveTranscript && speech.transcript && currentSpeakerId) {
      // Add the transcript to our lines
      // addTranscriptLine({
      //   text: speech.transcript,
      //   speakerId: currentSpeakerId,
      //   timestamp: Date.now()
      // });
      
      // Reset the transcript in the speech hook to avoid duplication
      speech.resetTranscript();
    }
  }, [
    isRecording, 
    isLiveTranscript, 
    speech.transcript, 
    currentSpeakerId, 
    // addTranscriptLine, 
    speech.resetTranscript
  ]);
  
  // Helper function to load audio file for playback
  const loadAudioFile = useCallback(async (filePath: string) => {
    // Skip if we're already loading this file
    setFilePathUrl(filePath);
    if (recordedAudioUrl === filePath) {
      console.log('Audio file already loaded:', filePath);
      return;
    }
    
    // In Electron environment, we need to use IPC to load the file
    const win = window as any;
    
    if (win?.electronAPI?.loadAudioFile) {
      try {
        console.log('Loading audio file:', filePath);
        const result = await win.electronAPI.loadAudioFile(filePath);
        
        if (result.success && result.dataUrl) {
          console.log('Audio loaded successfully from:', filePath);
          // Set the URL directly without re-triggering the loadAudioFile
          setRecordedAudioUrl(result.dataUrl);
          toast.success('Audio loaded successfully');
        } else if (result.useNativePlayer) {
          console.log('Using native player for:', filePath);
          toast.info('Opening file in native audio player');
          
          // Try to open with native player
          if (win?.electronAPI?.playAudioFile) {
            win.electronAPI.playAudioFile(filePath);
          }
          
          // Still set the path as the URL for UI purposes
          setRecordedAudioUrl(filePath);
        } else {
          console.error('Error loading audio:', result.error || 'Unknown error');
          toast.error(`Audio playback issue: ${result.error || 'Unknown error'}`);
          
          // Use the raw file path as fallback for the player to try
          console.log('Using raw file path as fallback');
          setRecordedAudioUrl(filePath);
          
          // Also try native player as last resort
          if (win?.electronAPI?.playAudioFile) {
            setTimeout(() => {
              win.electronAPI.playAudioFile(filePath);
            }, 500);
          }
        }
      } catch (error) {
        console.error('Error loading audio file:', error);
        toast.error('Failed to load audio file');
        
        // Use the raw file path as fallback
        if (filePath && filePath.trim() !== '') {
          console.log('Using raw file path as fallback after error');
          setRecordedAudioUrl(filePath);
          
          // Try native player as last resort
          if (win?.electronAPI?.playAudioFile) {
            setTimeout(() => {
              win.electronAPI.playAudioFile(filePath);
            }, 500);
          }
        }
      }
    } else {
      // If the loadAudioFile API is not available, just use the file path directly
      console.log('loadAudioFile API not available, using raw path');
      setRecordedAudioUrl(filePath);
    }
  }, [recordedAudioUrl]);
  
  // Effect to update recording path when any recording completes
  useEffect(() => {
    let path = null;
    
    if (systemRecordingPath && !isSystemRecording) {
      path = systemRecordingPath;
      console.log('System recording completed, path:', path);
    } else if (micRecordingPath && !isMicRecording) {
      path = micRecordingPath;
      console.log('Mic recording completed, path:', path);
    } else if (combinedRecordingPath && !isCombinedRecording) {
      path = combinedRecordingPath;
      console.log('Combined recording completed, path:', path);
    }
    
    if (path) {
      // Ensure the file exists before trying to load it
      const win = window as any;
      if (win?.electronAPI?.checkFileExists) {
        // First check if the file exists and has content
        win.electronAPI.checkFileExists(path)
          .then((exists: boolean) => {
            if (exists) {
              console.log('Audio file exists, loading:', path);
              // Only load if it's different from current
              if (path !== recordedAudioUrl) {
                loadAudioFile(path);
              }
            } else {
              console.error('Audio file does not exist or is empty:', path);
              toast.error('Recording file could not be created properly');
            }
          })
          .catch((error: any) => {
            console.error('Error checking file existence:', error);
            // Try loading anyway as fallback
            if (path !== recordedAudioUrl) {
              loadAudioFile(path);
            }
          });
      } else {
        // If we can't check, just try to load it
        if (path !== recordedAudioUrl) {
          console.log('Setting recorded audio URL:', path);
          loadAudioFile(path);
        }
      }
    }
  }, [
    systemRecordingPath, 
    micRecordingPath, 
    combinedRecordingPath,
    isSystemRecording,
    isMicRecording,
    isCombinedRecording,
    recordedAudioUrl,
    loadAudioFile
  ]);
  
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
  
  // Start/stop recording based on current source
  const handleStartStopRecording = useCallback(async () => {
    if (!isRecording) {
      // Start recording
      try {
        console.log(`Starting ${recordingSource} recording`);
        let success = false;
        
        if (recordingSource === 'system' && isSystemAvailable) {
          success = await startSystemRecording();
        } else if (recordingSource === 'mic' && isMicAvailable) {
          success = await startMicRecording();
        } else if (recordingSource === 'both' && isCombinedAvailable) {
          success = await startCombinedRecording();
        } else {
          // If preferred source is not available, fall back to available options
          if (isSystemAvailable) {
            success = await startSystemRecording();
            setRecordingSource('system');
          } else if (isMicAvailable) {
            success = await startMicRecording();
            setRecordingSource('mic');
          } else {
            throw new Error("No recording methods available");
          }
        }

        if (success) {
          // Start the speech recognition
          speech.startRecording();
          
          // Start recording timer
          startRecordingTimer();
          
          if (isNewMeeting) {
            setIsNewMeeting(false);
          }
          
          toast.success(`${recordingSource === 'both' ? 'Combined' : recordingSource === 'system' ? 'System audio' : 'Microphone'} recording started`);
        } else {
          toast.error("Failed to start recording");
        }
      } catch (err) {
        console.error("Error starting recording:", err);
        toast.error("Failed to start recording");
      }
    } else {
      // Stop recording
      console.log("Stopping recording");
      let success = false;
      
      try {
        if (isSystemRecording) {
          success = await stopSystemRecording();
        } else if (isMicRecording) {
          success = await stopMicRecording();
        } else if (isCombinedRecording) {
          success = await stopCombinedRecording();
        }
        
        // Stop the speech recognition
        speech.stopRecording();
        
        // Stop recording timer
        stopRecordingTimer();
        
        if (success) {
          console.log('DOR Debug - success:', success);
          toast.success("Recording stopped");
        } else {
          toast.error("Failed to stop recording");
        }
      } catch (err) {
        console.error("Error stopping recording:", err);
        toast.error("Failed to stop recording");
      }
      
      // For web fallback, handle the media recorder if it exists
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
  }, [
    isRecording, 
    recordingSource,
    isSystemAvailable,
    isMicAvailable,
    isCombinedAvailable,
    isSystemRecording,
    isMicRecording,
    isCombinedRecording,
    startSystemRecording,
    startMicRecording,
    startCombinedRecording,
    stopSystemRecording,
    stopMicRecording,
    stopCombinedRecording,
    speech,
    isNewMeeting
  ]);

  // Handle recording source change
  const handleRecordingSourceChange = useCallback((source: RecordingSource) => {
    console.log(`Changing recording source to ${source}`);
    setRecordingSource(source);
    
    // Save to settings if available
    if (settings && updateSettings) {
      updateSettings({ recordingSource: source });
    }
    
    toast.success(`Recording source changed to ${source === 'both' ? 'system audio + microphone' : source}`);
  }, [settings, updateSettings]);
  
  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Toggle live transcript
  const handleToggleLiveTranscript = useCallback(() => {
    setIsLiveTranscript(prev => !prev);
    
    toast.info(
      !isLiveTranscript
        ? "Live transcript enabled" 
        : "Live transcript disabled"
    );
  }, [isLiveTranscript]);
  
  // Change the current speaker
  const handleChangeSpeaker = useCallback((speakerId: string) => {
    setCurrentSpeakerId(speakerId);
  }, []);
  
  // Add a new speaker
  const handleAddNewSpeaker = useCallback((name: string) => {
    if (!name.trim()) return;
    
    const colors = ["#EA5455", "#00CFE8", "#9F44D3", "#666666", "#FE9900"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const newSpeaker = {
      id: `s${Date.now()}`,
      name,
      color: randomColor,
    };
    
    toast.success(`Added ${name} as a speaker`);
    return newSpeaker;
  }, []);
  
  // Save transcript to file
  const handleSaveTranscript = useCallback(async () => {
    // const result = await saveTranscript();
    
    // if (result.success) {
      toast.success('Transcript saved successfully');
    // }
  }, []);

  // Handle transcription of audio file
  const handleTranscribeAudio = useCallback(async () => {
    if (!recordedAudioUrl) {
      toast.error('No audio file available to transcribe');
      return;
    }

    try {
      toast.loading('Transcribing audio file. This may take a while for longer recordings...', { 
        id: 'transcribing',
        duration: 60000
      });
      
      const filePath = filePathUrl || recordedAudioUrl;
      console.log('filePath', filePath);
      
      const win = window as any;
      if (win?.electronAPI?.testSpeechWithFile) {
        toast.loading('Processing audio. Large files may take several minutes...', { 
          id: 'transcribing', 
          duration: 60000
        });
        
        console.log('win.electronAPI.testSpeechWithFile filePath', filePath);
        const result = await win.electronAPI.testSpeechWithFile(filePath);
        
        if (result.transcription) {
          // Handle the new response format
          const transcriptionText = typeof result.transcription === 'string' 
            ? result.transcription 
            : result.transcription.transcript;
            
          // Update speakers if provided
          if (result.transcription.speakers) {
            setSpeakers(result.transcription.speakers);
          }
          
          // Split the transcript into lines by speaker
          const lines = transcriptionText.split('\n').map(line => {
            const match = line.match(/^Speaker (\d+): (.+)$/);
            if (match) {
              return {
                id: `l${Date.now()}_${Math.random()}`,
                speakerId: match[1],
                text: match[2].trim()
              };
            }
            return {
              id: `l${Date.now()}_${Math.random()}`,
              speakerId: "1",
              text: line.trim()
            };
          });
          
          setTranscriptLines(prev => [...prev, ...lines]);
          toast.success('Transcription completed', { id: 'transcribing' });
        } else if (result.error) {
          console.log('result.error');
          if (result.error.includes('payload size exceeds')) {
            toast.error('Audio file is too large. Please record a shorter segment or trim the audio file.', { id: 'transcribing' });
          } else {
            toast.error(`Transcription failed: ${result.error}`, { id: 'transcribing' });
          }
        }
      } else {
        toast.error('Transcription API not available', { id: 'transcribing' });
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
      toast.error('Failed to transcribe audio', { id: 'transcribing' });
    }
  }, [recordedAudioUrl, filePathUrl]);

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
      audioRef.current.addEventListener('timeupdate', () => {
        setCurrentAudioTime(audioRef.current?.currentTime || 0);
      });
      
      audioRef.current.addEventListener('loadedmetadata', () => {
        setAudioDuration(audioRef.current?.duration || 0);
      });
      
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
      });
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = null;
      }
    };
  }, []);
  
  // Update audio source when recorded audio URL changes
  useEffect(() => {
    if (audioRef.current && recordedAudioUrl) {
      console.log('Updating audio source to:', recordedAudioUrl);
      
      // Make sure we're using file protocol for local files if needed
      let audioSrc = recordedAudioUrl;
      
      // If it's a local file path and doesn't have a protocol, add file:// protocol
      if (!audioSrc.startsWith('data:') && 
          !audioSrc.startsWith('http:') && 
          !audioSrc.startsWith('https:') && 
          !audioSrc.startsWith('file:') && 
          !audioSrc.startsWith('blob:')) {
        // Check if it's a macOS absolute path
        if (audioSrc.startsWith('/')) {
          audioSrc = `file://${audioSrc}`;
          console.log('Converted to file URL:', audioSrc);
        }
      }
      
      audioRef.current.src = audioSrc;
      audioRef.current.load();
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
  
  const handleSave = useCallback(async () => {
    if (!meetingId) {
      toast.error("Cannot save: Missing meeting ID");
      return;
    }

    try {
      // Start with a loading toast
      const loadingToast = toast.loading("Saving meeting data...");
      
      // 1. Create or update the meeting record
      const meetingData: Meeting = {
        _id: meetingId,
        title,
        description,
        tags,
        createdAt: meetingState?.createdAt ? new Date(meetingState.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recordingPath: recordedAudioUrl || undefined,
        recordingDuration: recordingDuration || undefined,
        liveTranscript: isLiveTranscript,
        type: 'meeting'
      };
      
      // Try to get existing meeting first
      try {
        const existingMeeting = await DatabaseService.getMeeting(meetingId);
        if (existingMeeting && existingMeeting._rev) {
          meetingData._rev = existingMeeting._rev;
          await DatabaseService.updateMeeting(meetingData);
        } else {
          await DatabaseService.createMeeting(meetingData);
        }
      } catch (err) {
        // If meeting doesn't exist, create it
        await DatabaseService.createMeeting(meetingData);
      }
      
      // 2. Save transcript lines with required properties
      if (transcriptLines.length > 0) {
        const formattedTranscriptLines = transcriptLines.map(line => ({
          ...line,
          meetingId,
          type: 'transcriptLine' as const
        }));
        await DatabaseService.saveTranscript(meetingId, formattedTranscriptLines as DBTranscriptLine[]);
      }
      
      // 3. Save speakers with required properties
      if (speakers.length > 0) {
        const formattedSpeakers = speakers.map(speaker => ({
          ...speaker,
          meetingId, 
          type: 'speaker' as const
        }));
        await DatabaseService.saveSpeakers(meetingId, formattedSpeakers as DBSpeaker[]);
      }
      
      // 4. Save action items
      if (actionItems.length > 0) {
        for (const item of actionItems) {
          const dbActionItem: DBActionItem = {
            id: item.id,
            meetingId,
            text: item.text,
            completed: item.completed,
            type: 'actionItem',
            updatedAt: new Date().toISOString()
          };
          await DatabaseService.saveActionItem(dbActionItem);
        }
      }
      
      // 5. Save notes
      const dbNotes: DBNotes = {
        meetingId,
        content: notes,
        updatedAt: new Date().toISOString(),
        type: 'notes'
      };
      await DatabaseService.saveNotes(dbNotes);
      
      // 6. Save context
      const dbContext: DBContext = {
        meetingId,
        name: context.name,
        files: context.files,
        overrideGlobal: context.overrideGlobal,
        type: 'context',
        updatedAt: new Date().toISOString()
      };
      await DatabaseService.saveContext(dbContext);
      
      // 7. If we have an audio file, ensure the path is saved
      if (recordedAudioUrl) {
        // If this is a blob URL created in the browser, we need to save the actual file
        if (recordedAudioUrl.startsWith('blob:')) {
          const win = window as any;
          
          if (win?.electronAPI?.saveAudioFile) {
            try {
              // Fetch the blob data
              const response = await fetch(recordedAudioUrl);
              const blob = await response.blob();
              const buffer = await blob.arrayBuffer();
              
              // Save via Electron
              const result = await win.electronAPI.saveAudioFile(
                buffer, 
                `recording_${meetingId}.wav`,
                ['wav', 'mp3']
              );
              
              if (result.success && result.filePath) {
                // Update the meeting with the actual file path
                const updatedMeeting: Meeting = {
                  ...meetingData,
                  recordingPath: result.filePath
                };
                await DatabaseService.updateMeeting(updatedMeeting);
              }
            } catch (error) {
              console.error('Error saving audio file:', error);
              toast.error('Failed to save audio file');
            }
          }
        }
      }
      
      // Close the loading toast and show success
      toast.dismiss(loadingToast);
      toast.success("Meeting saved successfully");
      
    } catch (error) {
      console.error('Error saving meeting:', error);
      toast.error('Failed to save meeting data');
    }
  }, [
    meetingId, 
    title, 
    description, 
    tags, 
    recordedAudioUrl, 
    recordingDuration,
    isLiveTranscript,
    transcriptLines,
    speakers,
    actionItems,
    notes,
    context,
    meetingState?.createdAt
  ]);
  
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

  // Handle audio playback
  const handlePlayPause = useCallback(() => {
    if (!recordedAudioUrl || !audioRef.current) {
      toast.error("No recorded audio available");
      return;
    }
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    
    setIsPlaying(!isPlaying);
  }, [isPlaying, recordedAudioUrl]);

  // Add a useEffect to debug audio URL state
  useEffect(() => {
    console.log('Debug - isNewMeeting:', isNewMeeting);
    console.log('Debug - transcriptLines.length:', transcriptLines.length);
  }, [recordedAudioUrl, isNewMeeting, transcriptLines.length]);

  // Render the component
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
                {/* Show AudioPlayer when we have an audio URL, regardless of meeting state */}
                {recordedAudioUrl ? (
                  <div className="flex flex-col gap-4 mb-4">
                    <div className="p-2 border border-blue-300 rounded-md bg-blue-50 mb-2">
                      <p className="text-sm text-blue-700">Audio file loaded: {recordedAudioUrl.substring(0, 50)}...</p>
                    </div>
                    
                    <AudioPlayer 
                      audioUrl={recordedAudioUrl}
                      autoPlay={false}
                      showWaveform={true}
                    />
                    
                    {/* Button to start a new recording */}
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={handleStartStopRecording}
                      >
                        {isRecording ? "Stop Recording" : "Record New Audio"}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={handleTranscribeAudio}
                      >
                        Send to Transcript
                      </Button>

                      {/* Recording source selector for existing recording */}
                      <div className="flex items-center gap-2 mt-2 p-1 rounded-md border border-input">
                        <Button
                          variant={recordingSource === 'system' ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => handleRecordingSourceChange('system')}
                          className="flex gap-1 items-center h-8"
                          disabled={!isSystemAvailable}
                        >
                          <Laptop className="h-3 w-3" />
                          <span className="text-xs">System</span>
                        </Button>
                        <Button
                          variant={recordingSource === 'mic' ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => handleRecordingSourceChange('mic')}
                          className="flex gap-1 items-center h-8"
                          disabled={!isMicAvailable}
                        >
                          <Mic className="h-3 w-3" />
                          <span className="text-xs">Mic</span>
                        </Button>
                        <Button
                          variant={recordingSource === 'both' ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => handleRecordingSourceChange('both')}
                          className="flex gap-1 items-center h-8"
                          disabled={!isCombinedAvailable}
                        >
                          <Headphones className="h-3 w-3" />
                          <span className="text-xs">Both</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 py-8">
                    {/* Recording source selector */}
                    <div className="flex items-center justify-center mb-4 space-x-4">
                      <div className="flex items-center gap-2 p-2 rounded-md border border-input">
                        <Button
                          variant={recordingSource === 'system' ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => handleRecordingSourceChange('system')}
                          className="flex gap-2 items-center"
                          disabled={!isSystemAvailable}
                          title={!isSystemAvailable ? "System audio recording not available" : "Record system audio"}
                        >
                          <Laptop className="h-4 w-4" />
                          <span>System</span>
                        </Button>
                        <Button
                          variant={recordingSource === 'mic' ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => handleRecordingSourceChange('mic')}
                          className="flex gap-2 items-center"
                          disabled={!isMicAvailable}
                          title={!isMicAvailable ? "Microphone recording not available" : "Record microphone"}
                        >
                          <Mic className="h-4 w-4" />
                          <span>Mic</span>
                        </Button>
                        <Button
                          variant={recordingSource === 'both' ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => handleRecordingSourceChange('both')}
                          className="flex gap-2 items-center"
                          disabled={!isCombinedAvailable}
                          title={!isCombinedAvailable ? "Combined recording not available" : "Record both system audio and microphone"}
                        >
                          <Headphones className="h-4 w-4" />
                          <span>Both</span>
                        </Button>
                      </div>
                    </div>
                    
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