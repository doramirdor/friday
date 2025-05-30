import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Play, Pause, Bold, Italic, Link as LinkIcon, ChevronRight, ChevronDown, Maximize, Minimize, Mic, Square, ToggleRight, ToggleLeft, Volume2, VolumeX, Laptop, Headphones, Sparkles, Trash2 } from "lucide-react";
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
import geminiService, { MeetingAnalysis } from '@/services/gemini';
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
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

// Simple debounce function
const debounce = <T extends unknown[]>(func: (...args: T) => void, wait: number) => {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: T) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

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

interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  env?: {
    GEMINI_API_KEY?: string;
  };
  sendMessage: (channel: string, data: unknown) => void;
  receive: (channel: string, callback: (...args: unknown[]) => void) => void;
  invokeGoogleSpeech: (audioBuffer: ArrayBuffer) => Promise<string>;
  loadAudioFile?: (filePath: string) => Promise<{
    success: boolean;
    dataUrl?: string;
    useNativePlayer?: boolean;
    error?: string;
  }>;
  checkFileExists?: (filePath: string) => Promise<boolean>;
  testSpeechWithFile?: (filePath: string) => Promise<{
    transcription?: string | { transcript: string; speakers?: Speaker[] };
    error?: string;
  }>;
  saveAudioFile?: (buffer: ArrayBuffer, filename: string, formats: string[]) => Promise<{
    success: boolean;
    filePath?: string;
  }>;
  readAudioFile?: (filePath: string) => Promise<{
    success: boolean;
    buffer?: ArrayBuffer;
    error?: string;
  }>;
  playAudioFile?: (filePath: string) => void;
}

interface ElectronWindow extends Window {
  electronAPI?: ElectronAPI;
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
  const [maxSpeakers, setMaxSpeakers] = useState<number>(4);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [newActionItem, setNewActionItem] = useState("");
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLineId, setCurrentLineId] = useState("l2");
  
  const [context, setContext] = useState<Context>({
    id: "c1",
    name: "",
    files: [],
    overrideGlobal: false,
  });
  
  // Add context content state for the textarea
  const [contextContent, setContextContent] = useState<string>("");
  
  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<MeetingAnalysis | null>(null);
  
  const [speakers, setSpeakers] = useState<Speaker[]>([
    { id: "1", name: "Speaker 1", color: "#28C76F" },
    { id: "2", name: "Speaker 2", color: "#7367F0" },
    { id: "3", name: "Speaker 3", color: "#FF9F43" },
  ]);
  
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingSpeakerName, setEditingSpeakerName] = useState("");
  
  // Add saving state to prevent concurrent saves
  const [isSaving, setIsSaving] = useState(false);
  
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
    settings?.recordingSource || 'both'
  );
  
  // Get meeting ID or generate a new one
  const meetingId = useMemo(() => {
    if (id && id !== 'new') {
      return id;
    }
    // Generate a unique ID for new meetings
    return `meeting_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }, [id]);
  
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
  
  // Load existing meeting data if not a new meeting
  useEffect(() => {
    const loadMeetingData = async () => {
      // Only load data for existing meetings (not new ones)
      if (!id || id === 'new' || meetingState?.isNew) {
        console.log('Skipping data load for new meeting');
        return;
      }

      try {
        console.log('Loading meeting data for ID:', id);
        const meetingDetails = await DatabaseService.getMeetingDetails(id);
        
        if (meetingDetails) {
          console.log('Loaded meeting details:', meetingDetails);
          
          // Update meeting basic info
          setTitle(meetingDetails.meeting.title);
          setDescription(meetingDetails.meeting.description);
          setTags(meetingDetails.meeting.tags);
          setMaxSpeakers(meetingDetails.meeting.maxSpeakers || 4);
          setIsLiveTranscript(meetingDetails.meeting.liveTranscript);
          
          // Update transcript lines
          if (meetingDetails.transcript && meetingDetails.transcript.length > 0) {
            const formattedTranscript = meetingDetails.transcript.map(line => ({
              id: line.id,
              text: line.text,
              speakerId: line.speakerId,
              isEditing: false
            }));
            setTranscriptLines(formattedTranscript);
          }
          
          // Update speakers
          if (meetingDetails.speakers && meetingDetails.speakers.length > 0) {
            const formattedSpeakers = meetingDetails.speakers.map(speaker => ({
              id: speaker.id,
              name: speaker.name,
              color: speaker.color
            }));
            setSpeakers(formattedSpeakers);
            setCurrentSpeakerId(formattedSpeakers[0].id);
          }
          
          // Update action items
          if (meetingDetails.actionItems && meetingDetails.actionItems.length > 0) {
            const formattedActionItems = meetingDetails.actionItems.map(item => ({
              id: item.id,
              text: item.text,
              completed: item.completed
            }));
            setActionItems(formattedActionItems);
          }
          
          // Update context
          if (meetingDetails.context) {
            setContext({
              id: meetingDetails.context._id || 'c1',
              name: meetingDetails.context.name || '',
              files: meetingDetails.context.files,
              overrideGlobal: meetingDetails.context.overrideGlobal
            });
            
            // Set context content if available
            if (meetingDetails.context.content) {
              setContextContent(meetingDetails.context.content);
            }
          }
          
          // Update recording info if available
          if (meetingDetails.meeting.recordingPath) {
            setRecordedAudioUrl(meetingDetails.meeting.recordingPath);
            setFilePathUrl(meetingDetails.meeting.recordingPath);
          }
          
          if (meetingDetails.meeting.recordingDuration !== undefined) {
            setRecordingDuration(meetingDetails.meeting.recordingDuration);
          }
          
          // Notes are handled by the useNotes hook
          
          console.log('Successfully loaded meeting data');
        } else {
          console.log('No meeting details found for ID:', id);
        }
      } catch (error) {
        console.error('Error loading meeting data:', error);
        toast.error('Failed to load meeting data');
      }
    };

    loadMeetingData();
  }, [id, meetingState?.isNew]);
  
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
    const win = window as ElectronWindow;
    
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
      const win = window as ElectronWindow;
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
          .catch((error: Error) => {
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
    
    // Only update if we have a valid duration or if we're currently recording
    // This preserves the final duration when recording stops
    if (duration > 0 || isSystemRecording || isMicRecording || isCombinedRecording) {
      setRecordingDuration(duration);
    }
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
          
          // Capture the final recording duration before it gets reset
          let finalDuration = 0;
          if (isSystemRecording) {
            finalDuration = systemRecordingDuration;
          } else if (isMicRecording) {
            finalDuration = micRecordingDuration;
          } else if (isCombinedRecording) {
            finalDuration = combinedRecordingDuration;
          }
          
          // Preserve the final duration
          if (finalDuration > 0) {
            setRecordingDuration(finalDuration);
          }
          
          toast.success("Recording stopped");
          // AUTO-SAVE DISABLED: Auto-save when recording stops has been disabled to prevent database conflicts
          console.log('🚫 AUTO-SAVE DISABLED: Recording stopped but auto-save is disabled');
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
    
    // AUTO-SAVE DISABLED: Settings updates disabled to prevent database conflicts
    console.log('🚫 AUTO-SAVE DISABLED: Recording source changed but settings not automatically saved');
    
    // This code is now disabled to prevent database conflicts:
    // Save to settings if available
    // if (settings && updateSettings) {
    //   updateSettings({ recordingSource: source });
    // }
    
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
  
  // Handle adding Gemini Live transcript to meeting
  const handleAddGeminiTranscript = useCallback((transcript: string) => {
    if (!transcript.trim()) return;
    
    // Parse the markdown-formatted transcript into lines
    const lines = transcript.split('\n').filter(line => line.trim());
    const newTranscriptLines: TranscriptLine[] = [];
    
    lines.forEach((line, index) => {
      const speakerMatch = line.match(/^\*\*Speaker (\d+)\*\*:\s*(.+)$/);
      
      if (speakerMatch) {
        const speakerTag = parseInt(speakerMatch[1]);
        const text = speakerMatch[2].trim();
        
        // Find or create speaker
        const speakerId = `${speakerTag}`;
        const existingSpeaker = speakers.find(s => s.id === speakerId);
        
        if (!existingSpeaker) {
          // Create new speaker
          const colors = ["#28C76F", "#7367F0", "#FF9F43", "#EA5455", "#00CFE8", "#9F44D3", "#666666", "#FE9900"];
          const newSpeaker = {
            id: speakerId,
            name: `Speaker ${speakerTag}`,
            color: colors[speakerTag % colors.length],
          };
          setSpeakers(prev => [...prev, newSpeaker]);
        }
        
        newTranscriptLines.push({
          id: `gemini-live-${Date.now()}-${index}`,
          text: text,
          speakerId: speakerId,
        });
      }
    });
    
    if (newTranscriptLines.length > 0) {
      setTranscriptLines(prev => [...prev, ...newTranscriptLines]);
      toast.success(`Added ${newTranscriptLines.length} transcript lines from Gemini Live`);
    }
  }, [speakers]);
  
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
        duration: 10000
      });
      
      const filePath = filePathUrl || recordedAudioUrl;
      console.log('filePath', filePath);
      
      const win = window as ElectronWindow;
      if (win?.electronAPI?.testSpeechWithFile) {
        toast.loading('Processing audio. Large files may take several minutes...', { 
          id: 'transcribing', 
          duration: 10000
        });
        
        console.log('win.electronAPI.testSpeechWithFile filePath', filePath);
        const result = await win.electronAPI.testSpeechWithFile(filePath);
        
        if (result.transcription) {
          // Handle the new response format
          const transcriptionText = typeof result.transcription === 'string' 
            ? result.transcription 
            : result.transcription.transcript;
            
          // Update speakers if provided
          if (typeof result.transcription === 'object' && result.transcription.speakers) {
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
          // AUTO-SAVE DISABLED: Auto-save when transcript is generated has been disabled to prevent database conflicts
          console.log('🚫 AUTO-SAVE DISABLED: Transcript generated but auto-save is disabled');
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

  // Handle Gemini transcription of audio file
  const handleGeminiTranscribe = useCallback(async () => {
    if (!recordedAudioUrl) {
      toast.error('No audio file available to transcribe');
      return;
    }

    try {
      console.log('Starting Gemini transcription for:', recordedAudioUrl);
      
      toast.loading('Transcribing with Gemini 2.5. This may take a while for longer recordings...', { 
        id: 'gemini-transcribing',
        duration: 15000
      });
      
      // Check if Gemini is available
      if (!geminiService.isAvailable()) {
        toast.error('Gemini AI is not configured. Please add your API key in settings.', { 
          id: 'gemini-transcribing' 
        });
        return;
      }
      
      // For file paths, check if the file exists first
      if (typeof recordedAudioUrl === 'string' && 
          !recordedAudioUrl.startsWith('data:') && 
          !recordedAudioUrl.startsWith('blob:') && 
          !recordedAudioUrl.startsWith('http')) {
        
        const electronAPI = (window as ElectronWindow).electronAPI;
        if (electronAPI?.checkFileExists) {
          const fileExists = await electronAPI.checkFileExists(recordedAudioUrl);
          if (!fileExists) {
            toast.error(`Audio file not found: ${recordedAudioUrl}`, { id: 'gemini-transcribing' });
            return;
          }
        }
      }
      
      // Transcribe audio using Gemini
      const result = await geminiService.transcribeAudio(recordedAudioUrl, maxSpeakers);
      
      if (result && result.transcript) {
        // Parse the transcript into lines
        const lines = result.transcript.split('\n').filter(line => line.trim());
        const newTranscriptLines: TranscriptLine[] = [];
        
        // Update speakers if we got new ones from Gemini
        if (result.speakers && result.speakers.length > 0) {
          const updatedSpeakers = result.speakers.map(speaker => ({
            ...speaker,
            meetingId: meetingId || ''
          }));
          setSpeakers(updatedSpeakers);
        }
        
        // Process each line
        lines.forEach((line, index) => {
          const speakerMatch = line.match(/^(Speaker\s+\d+):\s*(.+)$/i);
          
          if (speakerMatch) {
            const speakerName = speakerMatch[1];
            const text = speakerMatch[2].trim();
            
            // Find the speaker ID
            const speaker = result.speakers?.find(s => s.name === speakerName);
            const speakerId = speaker?.id || '1';
            
            newTranscriptLines.push({
              id: `gemini-${Date.now()}-${index}`,
              text: text,
              speakerId: speakerId,
            });
          } else if (line.trim()) {
            // If no speaker pattern, assign to default speaker
            newTranscriptLines.push({
              id: `gemini-${Date.now()}-${index}`,
              text: line.trim(),
              speakerId: '1',
            });
          }
        });
        
        // Update transcript lines
        setTranscriptLines(newTranscriptLines);
        
        toast.success('Audio transcribed successfully with Gemini AI!', { 
          id: 'gemini-transcribing' 
        });
        
        // Note: Auto-save will be triggered by the useEffect that watches transcriptLines changes
      } else {
        toast.error('No transcription received from Gemini', { id: 'gemini-transcribing' });
      }
      
    } catch (error) {
      console.error('Error transcribing audio with Gemini:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to transcribe audio with Gemini';
      if (error instanceof Error) {
        if (error.message.includes('File not found')) {
          errorMessage = 'Audio file not found. Please check if the recording file exists.';
        } else if (error.message.includes('Failed to read audio file')) {
          errorMessage = 'Could not read the audio file. The file may be corrupted or in an unsupported format.';
        } else if (error.message.includes('File reading not available')) {
          errorMessage = 'File reading is not available in this environment.';
        } else if (error.message.includes('API key')) {
          errorMessage = 'Gemini API key is not configured. Please add your API key in settings.';
        } else {
          errorMessage = `Transcription failed: ${error.message}`;
        }
      }
      
      toast.error(errorMessage, { id: 'gemini-transcribing' });
    }
  }, [recordedAudioUrl, meetingId]);

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

  // Process Google Live Transcript updates with speaker detection
  useEffect(() => {
    if (googleLiveTranscript.transcript && isGoogleLiveMode && googleLiveTranscript.isRecording) {
      const transcriptText = googleLiveTranscript.transcript.trim();
      if (transcriptText) {
        // Update speakers from Google Live Transcript
        if (googleLiveTranscript.speakers && googleLiveTranscript.speakers.length > 0) {
          setSpeakers(prevSpeakers => {
            const existingSpeakers = new Map(prevSpeakers.map(s => [s.id, s]));
            const newSpeakers = [...prevSpeakers];
            
            googleLiveTranscript.speakers!.forEach(googleSpeaker => {
              if (!existingSpeakers.has(googleSpeaker.id)) {
                newSpeakers.push({
                  id: googleSpeaker.id,
                  name: googleSpeaker.name,
                  color: googleSpeaker.color
                });
              }
            });
            
            return newSpeakers;
          });
        }

        // Parse the transcript to extract speaker lines
        const lines = transcriptText.split('\n').filter(line => line.trim());
        
        setTranscriptLines(prevLines => {
          const newLines = [...prevLines];
          
          lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              // Check if line starts with "Speaker X:" pattern
              const speakerMatch = trimmedLine.match(/^Speaker (\d+):\s*(.+)$/);
              
              if (speakerMatch) {
                const speakerId = speakerMatch[1];
                const text = speakerMatch[2];
                
                // Check if we already have this exact line to avoid duplicates
                const existingLine = newLines.find(l => l.text === text && l.speakerId === speakerId);
                if (!existingLine) {
                  // Add a new line
                  newLines.push({
                    id: `gl${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    text: text,
                    speakerId: speakerId,
                  });
                }
              } else {
                // If no speaker pattern, add to current speaker or create new line
                const speakerId = currentSpeakerId;
                const existingLine = newLines.find(l => l.text === trimmedLine && l.speakerId === speakerId);
                if (!existingLine) {
                  newLines.push({
                    id: `gl${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    text: trimmedLine,
                    speakerId: speakerId,
                  });
                }
              }
            }
          });
          
          return newLines;
        });

        // Clear the transcript to avoid duplication on next update
        googleLiveTranscript.clearTranscript();
      }
    }
  }, [googleLiveTranscript.transcript, googleLiveTranscript.speakers, googleLiveTranscript.isRecording, isGoogleLiveMode, currentSpeakerId]);

  // Process Google Live Transcript updates - now using hook's accumulated transcript
  useEffect(() => {
    if (isGoogleLiveMode && googleLiveTranscript.isRecording) {
      // Check if we have new transcript content from the hook
      const hookTranscript = googleLiveTranscript.transcript?.trim();
      
      if (hookTranscript) {
        console.log('🎯 Processing Google Live transcript update:', hookTranscript);
        
        // Update speakers from Google Live Transcript hook
        if (googleLiveTranscript.speakers && googleLiveTranscript.speakers.length > 0) {
          setSpeakers(prevSpeakers => {
            const existingSpeakers = new Map(prevSpeakers.map(s => [s.id, s]));
            const newSpeakers = [...prevSpeakers];
            
            googleLiveTranscript.speakers!.forEach(googleSpeaker => {
              if (!existingSpeakers.has(googleSpeaker.id)) {
                newSpeakers.push({
                  id: googleSpeaker.id,
                  name: googleSpeaker.name,
                  color: googleSpeaker.color
                });
              }
            });
            
            return newSpeakers;
          });
        }

        // Parse the accumulated transcript to extract all speaker lines
        const lines = hookTranscript.split('\n').filter(line => line.trim());
        
        // Replace existing transcript lines with the new parsed content
        const newTranscriptLines: TranscriptLine[] = [];
        
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            // Check if line starts with "Speaker X:" pattern
            const speakerMatch = trimmedLine.match(/^Speaker (\d+):\s*(.+)$/);
            
            if (speakerMatch) {
              const speakerId = speakerMatch[1];
              const text = speakerMatch[2];
              
              newTranscriptLines.push({
                id: `gl${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`,
                text: text,
                speakerId: speakerId,
              });
            } else {
              // If no speaker pattern, assign to current speaker
              newTranscriptLines.push({
                id: `gl${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`,
                text: trimmedLine,
                speakerId: currentSpeakerId,
              });
            }
          }
        });
        
        // Update transcript lines with new content
        if (newTranscriptLines.length > 0) {
          setTranscriptLines(prev => {
            // Filter out previous Google Live lines and add new ones
            const nonGoogleLines = prev.filter(line => !line.id.startsWith('gl'));
            return [...nonGoogleLines, ...newTranscriptLines];
          });
        }
      }
    }
  }, [isGoogleLiveMode, googleLiveTranscript.isRecording, googleLiveTranscript.transcript, googleLiveTranscript.speakers, currentSpeakerId]);

  // Process Google Live Transcript individual results in real-time
  useEffect(() => {
    if (isGoogleLiveMode && googleLiveTranscript.latestResult) {
      const result = googleLiveTranscript.latestResult;
      console.log('🎯 Processing Google Live individual result:', result);
      
      // Update speakers from the result
      if (result.speakers && result.speakers.length > 0) {
        setSpeakers(prevSpeakers => {
          const existingSpeakers = new Map(prevSpeakers.map(s => [s.id, s]));
          const newSpeakers = [...prevSpeakers];
          
          result.speakers!.forEach(googleSpeaker => {
            if (!existingSpeakers.has(googleSpeaker.id)) {
              newSpeakers.push({
                id: googleSpeaker.id,
                name: googleSpeaker.name,
                color: googleSpeaker.color
              });
            }
          });
          
          return newSpeakers;
        });
      }

      // Process the transcript text
      if (result.transcript && result.transcript.trim()) {
        const transcriptText = result.transcript.trim();
        
        // Parse the transcript to extract speaker lines
        const lines = transcriptText.split('\n').filter(line => line.trim());
        
        const newTranscriptLines: TranscriptLine[] = [];
        
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            // Check if line starts with "Speaker X:" pattern
            const speakerMatch = trimmedLine.match(/^Speaker (\d+):\s*(.+)$/);
            
            if (speakerMatch) {
              const speakerId = speakerMatch[1];
              const text = speakerMatch[2];
              
              newTranscriptLines.push({
                id: `gl${result.timestamp}_${index}_${Math.random().toString(36).substring(2, 9)}`,
                text: text,
                speakerId: speakerId,
              });
            } else {
              // If no speaker pattern, use the speakerId from the result or fallback to current speaker
              const speakerId = result.speakerId || currentSpeakerId;
              
              newTranscriptLines.push({
                id: `gl${result.timestamp}_${index}_${Math.random().toString(36).substring(2, 9)}`,
                text: trimmedLine,
                speakerId: speakerId,
              });
            }
          }
        });
        
        // Add new transcript lines
        if (newTranscriptLines.length > 0) {
          console.log('🎯 Adding new transcript lines:', newTranscriptLines);
          setTranscriptLines(prev => [...prev, ...newTranscriptLines]);
        }
      }
    }
  }, [isGoogleLiveMode, googleLiveTranscript.latestResult, currentSpeakerId]);

  // Watch for changes in transcript from speech recognition and add to lines
  useEffect(() => {
    if (speech.transcript && isRecording && !speech.transcript.startsWith('Error:')) {
      // Only add transcript if it's different from the last line (to avoid duplicates)
      setTranscriptLines(prev => {
        const lastLine = prev[prev.length - 1];
        if (lastLine && lastLine.text === speech.transcript) {
          return prev; // Don't add duplicate
        }
        
        return [...prev, {
          id: Date.now().toString(),
          text: speech.transcript,
          speakerId: currentSpeakerId,
          isEditing: false
        }];
      });
      
      // Auto-save after adding transcript
      setAutoSave(true);
    }
  }, [speech.transcript, isRecording, currentSpeakerId]);

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
  
  const handleEditSpeaker = (speakerId: string, newName: string) => {
    if (!newName.trim()) return;
    
    setSpeakers(speakers.map(speaker => 
      speaker.id === speakerId 
        ? { ...speaker, name: newName.trim() }
        : speaker
    ));
    
    setEditingSpeakerId(null);
    setEditingSpeakerName("");
    toast.success(`Speaker name updated to "${newName.trim()}"`);
  };

  const handleStartEditingSpeaker = (speaker: Speaker) => {
    setEditingSpeakerId(speaker.id);
    setEditingSpeakerName(speaker.name);
  };

  const handleCancelEditingSpeaker = () => {
    setEditingSpeakerId(null);
    setEditingSpeakerName("");
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
  
  const handleDeleteActionItem = (id: string) => {
    setActionItems(actionItems.filter(item => item.id !== id));
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

    // Prevent concurrent saves
    if (isSaving) {
      console.log('Save already in progress, skipping...');
      return;
    }

    setIsSaving(true);

    try {
      // Start with a loading toast
      const loadingToast = toast.loading("Saving meeting data...");
      
      // 1. Create or update the meeting record
      const meetingData: Meeting = {
        _id: meetingId,
        title,
        description,
        tags,
        maxSpeakers,
        createdAt: meetingState?.createdAt ? new Date(meetingState.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recordingPath: recordedAudioUrl || undefined,
        recordingDuration: recordingDuration || undefined,
        liveTranscript: isLiveTranscript,
        type: 'meeting'
      };
      
      // Use the new createOrUpdateMeeting function that handles both scenarios gracefully
      await DatabaseService.createOrUpdateMeeting(meetingData);
      
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
        const formattedActionItems = actionItems.map(item => ({
          id: item.id,
          meetingId,
          text: item.text,
          completed: item.completed,
          type: 'actionItem' as const,
          updatedAt: new Date().toISOString()
        }));
        await DatabaseService.saveActionItems(meetingId, formattedActionItems as DBActionItem[]);
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
        content: contextContent,
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
          const win = window as ElectronWindow;
          
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
    } finally {
      setIsSaving(false);
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
    contextContent,
    meetingState?.createdAt,
    isSaving
  ]);
  
  // AUTO-SAVE DISABLED: Debounced auto-save function has been disabled to prevent database conflicts
  const debouncedAutoSave = useCallback(
    debounce(async () => {
      // AUTO-SAVE DISABLED: All automatic saves have been disabled
      console.log('🚫 AUTO-SAVE DISABLED: Debounced auto-save triggered but disabled to prevent database conflicts');
      return;
      
      // This code is now disabled to prevent database conflicts
      // Don't auto-save while recording is active or already saving to prevent loops
      // if (isRecording || isSaving) {
      //   console.log('Skipping auto-save during active recording or save in progress');
      //   return;
      // }
      // 
      // try {
      //   await handleSave();
      //   console.log('Auto-saved meeting data');
      // } catch (error) {
      //   console.error('Error during auto-save:', error);
      // }
    }, 1000), // 1 second debounce
    [handleSave, isRecording, isSaving]
  );
  
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

  // AUTO-SAVE DISABLED: Auto-save when leaving the page has been disabled to prevent database conflicts
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      // AUTO-SAVE DISABLED: Auto-save before unload has been disabled
      console.log('🚫 AUTO-SAVE DISABLED: Page unload detected but auto-save is disabled');
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        // AUTO-SAVE DISABLED: Auto-save on visibility change has been disabled
        console.log('🚫 AUTO-SAVE DISABLED: Page hidden but auto-save is disabled');
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function - auto-save disabled
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // AUTO-SAVE DISABLED: Auto-save when component unmounts has been disabled
      console.log('🚫 AUTO-SAVE DISABLED: Component unmounting but auto-save is disabled');
    };
  }, [handleSave]);

  // Auto-save only on meaningful actions (removed excessive change-based auto-saves)
  // Auto-save is now triggered only by:
  // 1. Recording stopped (in recording logic)
  // 2. Transcript generated (in handleTranscribeAudio)
  // 3. AI analysis completed (in handleAIAnalysis)
  // 4. Back to library button clicked (in header button)
  // 5. Page unload/visibility change (in useEffect above)

  // Handle AI analysis of the meeting
  const handleAIAnalysis = useCallback(async () => {
    if (!transcriptLines.length) {
      toast.error("No transcript available for analysis");
      return;
    }

    if (!geminiService.isAvailable()) {
      toast.error("Gemini AI is not configured. Please add your API key in settings.");
      return;
    }

    setIsAnalyzing(true);
    
    try {
      // Get global context from settings
      const settings = await DatabaseService.getSettings();
      const globalContext = await DatabaseService.getGlobalContext();
      
      // Prepare analysis input
      const analysisInput = {
        transcript: transcriptLines.map(line => ({
          ...line,
          meetingId,
          type: 'transcriptLine' as const
        })) as DBTranscriptLine[],
        speakers: speakers.map(speaker => ({
          ...speaker,
          meetingId,
          type: 'speaker' as const
        })) as DBSpeaker[],
        meetingContext: contextContent ? {
          meetingId,
          name: context.name,
          content: contextContent,
          files: context.files,
          overrideGlobal: context.overrideGlobal,
          type: 'context' as const,
          updatedAt: new Date().toISOString()
        } as DBContext : undefined,
        globalContext: globalContext || undefined,
        currentTitle: title,
        currentDescription: description
      };

      const analysis = await geminiService.analyzeMeeting(analysisInput);
      setAnalysisResults(analysis);

      // Apply the analysis results
      setTitle(analysis.title);
      setDescription(analysis.description);
      setTags(analysis.tags);
      setNotes(typeof analysis.notes === 'string' ? analysis.notes : '');

      toast.success("AI analysis completed! Meeting details have been updated.");
      
      // AUTO-SAVE DISABLED: Auto-save after AI analysis has been disabled to prevent database conflicts
      console.log('🚫 AUTO-SAVE DISABLED: AI analysis completed but auto-save is disabled');
      
    } catch (error) {
      console.error('Error during AI analysis:', error);
      toast.error(`AI analysis failed: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    transcriptLines, 
    speakers, 
    meetingId, 
    context, 
    contextContent, 
    title, 
    description, 
    setNotes
  ]);

  // Add delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Handle delete meeting
  const handleDeleteMeeting = useCallback(async () => {
    if (!meetingId || meetingId === 'new' || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      // Delete the meeting and all associated data
      await DatabaseService.deleteMeeting(meetingId);
      
      toast.success("Meeting deleted successfully");
      
      // Navigate back to library
      navigate('/library');
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error("Failed to delete meeting. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [meetingId, isDeleting, navigate]);

  const handleDeleteTranscriptLine = (id: string) => {
    setTranscriptLines(transcriptLines.filter(line => line.id !== id));
  };

  // Render the component
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-background border-b border-border px-6 py-4 flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={async () => {
            // AUTO-SAVE DISABLED: Auto-save before navigating back has been disabled to prevent database conflicts
            console.log('🚫 AUTO-SAVE DISABLED: Navigating back but auto-save is disabled');
            navigate("/library");
          }}
          className="h-8 w-8 p-0 rounded-full"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">Back</span>
        </Button>
        
        <h1 className="text-xl font-semibold flex-1">{title}</h1>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleAIAnalysis}
          disabled={isAnalyzing || !transcriptLines.length}
          className="flex items-center gap-2"
        >
          <Sparkles className={`h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
          {isAnalyzing ? 'Analyzing...' : 'AI Analysis'}
        </Button>

        {/* Delete button - only show for existing meetings */}
        {meetingId && meetingId !== 'new' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isDeleting}
            className="flex items-center gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete Meeting
          </Button>
        )}
        
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
      
      <div className="flex flex-1 overflow-hidden relative">
        {/* Toggle buttons positioned outside panels so they remain visible when collapsed */}
        {/* <Button
          variant="ghost"
          size="sm"
          onClick={toggleLeftPanel}
          className="absolute left-2 top-4 z-20 h-8 w-8 p-0 rounded-full bg-accent/50 shadow-md"
        >
          {leftPanelCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleRightPanel}
          className="absolute right-2 top-4 z-20 h-8 w-8 p-0 rounded-full bg-accent/50 shadow-md"
        >
          {rightPanelCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
         */}
        <ResizablePanelGroup 
          direction="horizontal" 
          className="w-full"
          onLayout={(sizes) => {
            localStorage.setItem('panelSizes', JSON.stringify(sizes));
          }}
        >
          {/* Left panel (Transcript) */}
          <ResizablePanel 
            defaultSize={leftPanelCollapsed ? 0 : 50} 
            minSize={15}
            maxSize={85}
            collapsible={true}
            collapsedSize={0}
            onCollapse={() => setLeftPanelCollapsed(true)}
            onExpand={() => setLeftPanelCollapsed(false)}
          >
            <div className="flex flex-col h-full overflow-hidden">
              {/* Recording controls for new meeting or Waveform player for existing */}
              <div className="p-6 border-b">
                {/* Show AudioPlayer when we have an audio URL, regardless of meeting state */}
                {recordedAudioUrl ? (
                  <div className="flex flex-col gap-4 mb-4">
                    {/* <div className="p-2 border border-blue-300 rounded-md bg-blue-50 mb-2">
                      <p className="text-sm text-blue-700">Audio file loaded: {recordedAudioUrl.substring(0, 50)}...</p>
                    </div> */}
                    
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
                      <div className="flex gap-2 mt-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={handleTranscribeAudio}
                        >
                          Google Speech
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={handleGeminiTranscribe}
                        >
                          Gemini 2.5
                        </Button>
                      </div>

                      {/* Recording source selector for existing recording */}
                      {/* <div className="flex items-center gap-2 mt-2 p-1 rounded-md border border-input">
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
                      </div> */}
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
                    
                    <div className="flex flex-col items-center gap-4 mb-4">
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
                    
                    {/* Live transcript toggle and mode selection */}
                    <div className="flex flex-col items-center gap-4 mb-4">
                      <div className="flex items-center justify-center space-x-2">
                        <Switch
                          id="live-transcript"
                          checked={isLiveTranscript}
                          onCheckedChange={setIsLiveTranscript}
                          disabled={!streamingSpeech.isAvailable && !geminiLive.isAvailable && !googleLiveTranscript.isAvailable}
                        />
                        <Label htmlFor="live-transcript" className="text-sm">
                          Live Transcript
                        </Label>
                      </div>
                      
                      {/* Mode selection */}
                      {isLiveTranscript && (
                        <div className="flex items-center gap-2 p-2 rounded-md border border-input">
                          <Button
                            variant={isGeminiLiveMode && !isGoogleLiveMode ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => {
                              setIsGeminiLiveMode(true);
                              setIsGoogleLiveMode(false);
                            }}
                            className="flex gap-2 items-center"
                            disabled={!geminiLive.isAvailable}
                            title={!geminiLive.isAvailable ? "Gemini Live not available - check API key" : "Use Gemini Live for real-time transcription"}
                          >
                            <Sparkles className="h-4 w-4" />
                            <span>Gemini Live</span>
                          </Button>
                          <Button
                            variant={isGoogleLiveMode ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => {
                              setIsGeminiLiveMode(false);
                              setIsGoogleLiveMode(true);
                            }}
                            className="flex gap-2 items-center"
                            disabled={!googleLiveTranscript.isAvailable}
                            title={!googleLiveTranscript.isAvailable ? "Google Live Transcript not available - check API key" : "Use Google Live Transcript for real-time transcription with speaker detection"}
                          >
                            <Mic className="h-4 w-4" />
                            <span>Google Live</span>
                          </Button>
                          <Button
                            variant={!isGeminiLiveMode && !isGoogleLiveMode ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => {
                              setIsGeminiLiveMode(false);
                              setIsGoogleLiveMode(false);
                            }}
                            className="flex gap-2 items-center"
                            disabled={!streamingSpeech.isAvailable}
                            title={!streamingSpeech.isAvailable ? "Google Speech not available - check API key" : "Use Google Cloud Speech for semi-live transcription (sends audio chunks every few seconds)"}
                          >
                            <Mic className="h-4 w-4" />
                            <span>Google Speech</span>
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Live transcript interface */}
                    {isLiveTranscript && (
                      <>
                        {isGeminiLiveMode && !isGoogleLiveMode ? (
                          <GeminiSemiLiveTranscript
                            maxSpeakers={maxSpeakers}
                            onTranscriptAdd={handleAddGeminiTranscript}
                            className="mb-4"
                          />
                        ) : isGoogleLiveMode ? (
                          <div className="flex flex-col items-center gap-4 mb-4 p-4 border rounded-lg bg-green-50">
                            <div className="flex items-center gap-2">
                              <Button
                                variant={googleLiveTranscript.isRecording ? "destructive" : "default"}
                                size="sm"
                                onClick={() => {
                                  if (googleLiveTranscript.isRecording) {
                                    googleLiveTranscript.stopRecording();
                                  } else {
                                    googleLiveTranscript.startRecording({
                                      languageCode: 'en-US',
                                      enableSpeakerDiarization: true,
                                      maxSpeakers: maxSpeakers,
                                      encoding: 'MP3', // Changed from LINEAR16 to MP3
                                      sampleRateHertz: 44100, // Changed from 16000 to 44100
                                    });
                                  }
                                }}
                                className="flex items-center gap-2"
                              >
                                {googleLiveTranscript.isRecording ? (
                                  <>
                                    <Square className="h-4 w-4" />
                                    Stop Google Live
                                  </>
                                ) : (
                                  <>
                                    <Mic className="h-4 w-4" />
                                    Start Google Live
                                  </>
                                )}
                              </Button>
                              
                              {googleLiveTranscript.isRecording && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={googleLiveTranscript.clearTranscript}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>

                            {/* Live transcript display */}
                            {googleLiveTranscript.transcript && (
                              <div className="w-full max-w-2xl">
                                <div className="p-3 border rounded bg-white min-h-[100px] max-h-[200px] overflow-y-auto">
                                  <div className="text-sm">
                                    <pre className="whitespace-pre-wrap">{googleLiveTranscript.transcript}</pre>
                                  </div>
                                </div>
                                
                                {/* Speakers display */}
                                {googleLiveTranscript.speakers && googleLiveTranscript.speakers.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {googleLiveTranscript.speakers.map((speaker) => (
                                      <div
                                        key={speaker.id}
                                        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                                        style={{ backgroundColor: speaker.color, color: 'white' }}
                                      >
                                        {speaker.name}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Button to manually add transcript to meeting */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2 w-full"
                                  onClick={() => {
                                    // The transcript is already being processed automatically
                                    // This button just provides feedback that it's working
                                    toast.success('Google Live transcript is automatically added to meeting');
                                  }}
                                >
                                  Auto-Adding to Meeting Transcript
                                </Button>
                              </div>
                            )}

                            {/* Error display */}
                            {googleLiveTranscript.error && (
                              <div className="text-red-600 text-sm text-center">
                                Error: {googleLiveTranscript.error}
                              </div>
                            )}
                          </div>
                        ) : (
                          streamingSpeech.isAvailable && (
                            <div className="flex flex-col items-center gap-4 mb-4 p-4 border rounded-lg bg-blue-50">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant={streamingSpeech.isStreaming ? "destructive" : "default"}
                                  size="sm"
                                  onClick={() => {
                                    if (streamingSpeech.isStreaming) {
                                      streamingSpeech.stopStreaming();
                                    } else {
                                      const options: SemiLiveSpeechOptions = {
                                        languageCode: 'en-US',
                                        chunkDurationMs: 3000 // Send chunks every 3 seconds
                                      };
                                      streamingSpeech.startStreaming(options);
                                    }
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  {streamingSpeech.isStreaming ? (
                                    <>
                                      <Square className="h-4 w-4" />
                                      Stop Live Transcript
                                    </>
                                  ) : (
                                    <>
                                      <Mic className="h-4 w-4" />
                                      Start Live Transcript
                                    </>
                                  )}
                                </Button>
                                
                                {streamingSpeech.isStreaming && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={streamingSpeech.clearTranscript}
                                  >
                                    Clear
                                  </Button>
                                )}
                              </div>

                              {/* Live transcript display */}
                              {(streamingSpeech.transcript || streamingSpeech.interimTranscript) && (
                                <div className="w-full max-w-2xl">
                                  <div className="p-3 border rounded bg-white min-h-[100px] max-h-[200px] overflow-y-auto">
                                    <div className="text-sm">
                                      {/* Final transcript */}
                                      {streamingSpeech.transcript && (
                                        <span className="text-gray-900">
                                          {streamingSpeech.transcript}
                                        </span>
                                      )}
                                      
                                      {/* Interim transcript */}
                                      {streamingSpeech.interimTranscript && (
                                        <span className="text-gray-500 italic">
                                          {streamingSpeech.transcript ? ' ' : ''}
                                          {streamingSpeech.interimTranscript}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Confidence and speaker info */}
                                  <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                                    {streamingSpeech.confidence && (
                                      <span>Confidence: {Math.round(streamingSpeech.confidence * 100)}%</span>
                                    )}
                                    {streamingSpeech.speakerId && (
                                      <span>Speaker: {streamingSpeech.speakerId}</span>
                                    )}
                                  </div>

                                  {/* Button to add live transcript to meeting */}
                                  {streamingSpeech.transcript && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="mt-2 w-full"
                                      onClick={() => {
                                        // Add the live transcript to the meeting transcript
                                        const newLine: TranscriptLine = {
                                          id: Date.now().toString(),
                                          speakerId: streamingSpeech.speakerId || currentSpeakerId,
                                          text: streamingSpeech.transcript
                                        };
                                        
                                        setTranscriptLines(prev => [...prev, newLine]);
                                        
                                        // Clear the live transcript
                                        streamingSpeech.clearTranscript();
                                        
                                        toast.success('Live transcript added to meeting');
                                      }}
                                    >
                                      Add to Meeting Transcript
                                    </Button>
                                  )}
                                </div>
                              )}

                              {/* Error display */}
                              {streamingSpeech.error && (
                                <div className="text-red-600 text-sm text-center">
                                  Error: {streamingSpeech.error.message}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              
              {/* Transcript lines */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium">Transcript</h2>
                  </div>
                  
                  {/* Empty state for new meeting */}
                  {isNewMeeting || transcriptLines.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <p>No transcript available yet</p>
                      <p className="mt-2 text-sm">Start recording to begin transcription</p>
                    </div>
                  ) : (
                    transcriptLines.map((line) => {
                      const speaker = speakers.find(s => s.id === line.speakerId);
                      return (
                        <div 
                          key={line.id} 
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                        >
                          <div 
                            className="w-3 h-3 rounded-full mt-2 flex-shrink-0"
                            style={{ backgroundColor: speaker?.color || '#666666' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-muted-foreground">
                                {speaker?.name || `Speaker ${line.speakerId}`}
                              </span>
                            </div>
                            {line.isEditing ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={line.text}
                                  onChange={(e) => {
                                    setTranscriptLines(transcriptLines.map(l => 
                                      l.id === line.id ? { ...l, text: e.target.value } : l
                                    ));
                                  }}
                                  className="min-h-[60px] resize-none"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setTranscriptLines(transcriptLines.map(l => 
                                        l.id === line.id ? { ...l, isEditing: false } : l
                                      ));
                                    }}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setTranscriptLines(transcriptLines.map(l => 
                                        l.id === line.id ? { ...l, isEditing: false } : l
                                      ));
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p 
                                className="text-sm leading-relaxed cursor-pointer hover:bg-accent/30 p-1 rounded"
                                onClick={() => {
                                  setTranscriptLines(transcriptLines.map(l => 
                                    l.id === line.id ? { ...l, isEditing: true } : l
                                  ));
                                }}
                              >
                                {line.text}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTranscriptLine(line.id)}
                            className="h-8 w-8 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete line</span>
                          </Button>
                        </div>
                      );
                    })
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
            defaultSize={rightPanelCollapsed ? 0 : 50}
            minSize={15}
            maxSize={85}
            collapsible={true}
            collapsedSize={0}
            onCollapse={() => setRightPanelCollapsed(true)}
            onExpand={() => setRightPanelCollapsed(false)}
          >
            <Tabs defaultValue="details" className="w-full h-full flex flex-col">
              <TabsList className="w-full justify-start border-b rounded-none px-6 h-12">
                <TabsTrigger value="details" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Details
                </TabsTrigger>
                <TabsTrigger value="speakers" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Speakers
                </TabsTrigger>
                <TabsTrigger value="summary" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Summary
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
              
                
                <TabsContent value="speakers" className="p-6 space-y-6 h-full">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <Label htmlFor="max-speakers">Maximum Number of Speakers</Label>
                      <Input
                        id="max-speakers"
                        type="number"
                        min="1"
                        max="10"
                        value={maxSpeakers}
                        onChange={(e) => setMaxSpeakers(parseInt(e.target.value) || 4)}
                      />
                      <p className="text-sm text-muted-foreground">
                        Set the maximum number of speakers for AI transcription. This helps prevent the AI from creating too many speakers when it misidentifies speech patterns.
                      </p>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="speakers-list">Current Speakers</Label>
                        <span className="text-sm text-muted-foreground">
                          {speakers.length} speaker{speakers.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <div className="space-y-3 max-h-[300px] overflow-y-auto">
                        {speakers.map((speaker) => (
                          <div
                            key={speaker.id}
                            className="flex items-center gap-3 p-3 border rounded-md hover:bg-accent/50 transition-colors"
                          >
                            <div 
                              className="w-4 h-4 rounded-full flex-shrink-0"
                              style={{ backgroundColor: speaker.color }}
                            />
                            
                            {editingSpeakerId === speaker.id ? (
                              <div className="flex-1 flex items-center gap-2">
                                <Input
                                  value={editingSpeakerName}
                                  onChange={(e) => setEditingSpeakerName(e.target.value)}
                                  className="text-sm"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleEditSpeaker(speaker.id, editingSpeakerName);
                                    } else if (e.key === "Escape") {
                                      handleCancelEditingSpeaker();
                                    }
                                  }}
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleEditSpeaker(speaker.id, editingSpeakerName)}
                                  className="h-8 px-2"
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleCancelEditingSpeaker}
                                  className="h-8 px-2"
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span 
                                  className="text-sm font-medium flex-1 cursor-pointer hover:text-primary"
                                  onClick={() => handleStartEditingSpeaker(speaker)}
                                  title="Click to edit speaker name"
                                >
                                  {speaker.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ID: {speaker.id}
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                        
                        {speakers.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <p>No speakers detected yet</p>
                            <p className="text-sm mt-1">Speakers will be automatically detected during transcription</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="summary" className="p-6 space-y-6 h-full">
                  <div className="space-y-6">
                    {analysisResults ? (
                      <>
                        {/* Summary Section */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label className="text-lg font-semibold">Meeting Summary</Label>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Sentiment:</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                analysisResults.sentiment === 'Positive' ? 'bg-green-100 text-green-800' :
                                analysisResults.sentiment === 'Negative' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {analysisResults.sentiment}
                              </span>
                            </div>
                          </div>
                          <div className="p-4 border rounded-md bg-accent/20">
                            <p className="text-sm leading-relaxed">{analysisResults.summary}</p>
                          </div>
                        </div>

                        {/* Decisions Section */}
                        {analysisResults.decisions.length > 0 && (
                          <div className="space-y-4">
                            <Label className="text-lg font-semibold">Decisions Made</Label>
                            <div className="space-y-3">
                              {analysisResults.decisions.map((decision, index) => (
                                <div key={index} className="p-4 border rounded-md bg-blue-50">
                                  <h4 className="font-medium text-blue-900 mb-2">{decision.decision}</h4>
                                  <p className="text-sm text-blue-700 mb-2"><strong>Rationale:</strong> {decision.rationale}</p>
                                  <p className="text-sm text-blue-700"><strong>Expected Impact:</strong> {decision.impact}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AI Action Items Section */}
                        {analysisResults.action_items.length > 0 && (
                          <div className="space-y-4">
                            <Label className="text-lg font-semibold">AI-Identified Action Items</Label>
                            <div className="space-y-3">
                              {analysisResults.action_items.map((item, index) => (
                                <div key={index} className="p-4 border rounded-md bg-yellow-50">
                                  <div className="flex items-start justify-between mb-2">
                                    <h4 className="font-medium text-yellow-900">{item.task}</h4>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      item.priority === 'High' ? 'bg-red-100 text-red-800' :
                                      item.priority === 'Med' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-green-100 text-green-800'
                                    }`}>
                                      {item.priority}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-yellow-700">
                                    <span><strong>Owner:</strong> {item.owner}</span>
                                    <span><strong>Due:</strong> {item.due_date}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Risks Section */}
                        {analysisResults.risks.length > 0 && (
                          <div className="space-y-4">
                            <Label className="text-lg font-semibold">Identified Risks</Label>
                            <div className="space-y-2">
                              {analysisResults.risks.map((risk, index) => (
                                <div key={index} className="p-3 border rounded-md bg-red-50">
                                  <p className="text-sm text-red-700">{risk}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Open Questions Section */}
                        {analysisResults.open_questions.length > 0 && (
                          <div className="space-y-4">
                            <Label className="text-lg font-semibold">Open Questions</Label>
                            <div className="space-y-2">
                              {analysisResults.open_questions.map((question, index) => (
                                <div key={index} className="p-3 border rounded-md bg-purple-50">
                                  <p className="text-sm text-purple-700">{question}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-16 text-muted-foreground">
                        <p>No AI analysis available yet</p>
                        <p className="mt-2 text-sm">Run AI Analysis to generate a comprehensive meeting summary</p>
                        <Button
                          variant="outline"
                          onClick={handleAIAnalysis}
                          disabled={isAnalyzing || !transcriptLines.length}
                          className="mt-4 flex items-center gap-2"
                        >
                          <Sparkles className={`h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                          {isAnalyzing ? 'Analyzing...' : 'Run AI Analysis'}
                        </Button>
                      </div>
                    )}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteActionItem(item.id)}
                            className="h-8 w-8 p-0 text-destructive"
                          >
                            <span className="sr-only">Remove</span>
                            ×
                          </Button>
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
                        dangerouslySetInnerHTML={{ __html: (notes || '').replace(/\n/g, '<br />') }}
                        className="prose prose-sm max-w-none"
                      />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="context" className="p-6 space-y-6 h-full">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="context-content">Meeting Context</Label>
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
                    
                    <Textarea
                      id="context-content"
                      value={contextContent}
                      onChange={(e) => setContextContent(e.target.value)}
                      placeholder="Add context information for this meeting..."
                      rows={8}
                      className="resize-none"
                    />
                    <p className="text-sm text-muted-foreground">
                      Provide relevant context, background information, or notes for this meeting.
                    </p>
                    
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{title}"? This action cannot be undone. All transcript data, notes, and action items will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteMeeting}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Meeting"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Temporary: Add unified test component */}
      <div className="p-4 bg-blue-50 border-b">
        <details className="cursor-pointer">
          <summary className="text-sm font-medium text-blue-700">🧪 Test New Unified Gemini Live (Click to expand)</summary>
          <div className="mt-4">
            <GeminiLiveUnifiedTest />
          </div>
        </details>
      </div>

      {/* Temporary: Add Google Live Transcript test component */}
      <div className="p-4 bg-green-50 border-b">
        <details className="cursor-pointer">
          <summary className="text-sm font-medium text-green-700">🧪 Test Google Live Transcript (Click to expand)</summary>
          <div className="mt-4">
            <GoogleLiveTranscriptNew />
          </div>
        </details>
      </div>
    </div>
  );
};

export default TranscriptDetails; 