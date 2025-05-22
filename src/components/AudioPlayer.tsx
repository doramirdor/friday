import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Download } from "lucide-react";
import { toast } from "sonner";

interface AudioPlayerProps {
  audioUrl: string | null;
  autoPlay?: boolean;
  showWaveform?: boolean;
}

const AudioPlayer = ({ audioUrl, autoPlay = true, showWaveform = true }: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentAudioTime, setCurrentAudioTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(80);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isHighlighted, setIsHighlighted] = useState<boolean>(true);
  const [audioError, setAudioError] = useState<boolean>(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Format time in mm:ss format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
        if (audioRef.current.src.startsWith('blob:')) {
          URL.revokeObjectURL(audioRef.current.src);
        }
        audioRef.current = null;
      }
    };
  }, []);
  
  // Helper function to play audio with native player when browser playback fails
  const playWithNativePlayer = async () => {
    const win = window as any;
    if (win?.electronAPI?.playAudioFile && audioUrl) {
      try {
        // Extract the original file path if it's in the audioUrl
        let filePath = audioUrl;
        
        // If it's a data URL, we need to extract the path from debug info
        if (audioUrl.startsWith('data:')) {
          // Try to look for a path at the end of the URL (special format we might add)
          const pathMatch = audioUrl.match(/\?path=(.+)$/);
          if (pathMatch && pathMatch[1]) {
            filePath = decodeURIComponent(pathMatch[1]);
          } else {
            // Try to get the path from the latest debug logs
            // This is just a fallback and might not always work
            const debugConsole = document.querySelector('.debug-info-path')?.textContent;
            if (debugConsole) {
              const pathMatch = debugConsole.match(/from:\s*([^,\s]+)/);
              if (pathMatch && pathMatch[1]) {
                filePath = pathMatch[1];
              }
            }
          }
        }
        
        // Only try native player if we have a file path (not a data URL)
        if (!filePath.startsWith('data:') && !filePath.startsWith('blob:')) {
          console.log('AudioPlayer: Trying native player with path:', filePath);
          const result = await win.electronAPI.playAudioFile(filePath);
          if (result.success) {
            toast.success("Playing with native audio player");
            return true;
          }
        }
      } catch (error) {
        console.error('Error playing with native player:', error);
      }
    }
    return false;
  };
  
  // Update audio source when audioUrl changes and play automatically if autoPlay is true
  useEffect(() => {
    setAudioError(false);
    
    if (audioRef.current && audioUrl) {
      // Debug log to check audio URL
      console.log(`AudioPlayer: Setting audio source, URL type: ${audioUrl.substring(0, 20)}...`);
      
      // Make sure the URL is valid
      if (audioUrl.startsWith('data:audio/')) {
        console.log("AudioPlayer: Using data URL");
      } else if (audioUrl.startsWith('file://')) {
        console.log("AudioPlayer: Using file URL - this may not work in browser");
      } else if (audioUrl.startsWith('http')) {
        console.log("AudioPlayer: Using HTTP URL");
      } else {
        console.log("AudioPlayer: Using file path or other URL type");
      }
      
      // Set the source and load the audio
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      
      // Log when audio metadata is loaded
      const metadataHandler = () => {
        console.log(`AudioPlayer: Audio metadata loaded, duration: ${audioRef.current?.duration}s`);
        setAudioError(false);
      };
      
      // Log errors
      const errorHandler = async (e: ErrorEvent) => {
        console.error("AudioPlayer: Error loading audio:", e);
        console.error("AudioPlayer: Error details:", audioRef.current?.error);
        setAudioError(true);
        
        // Try using native player as fallback
        if (await playWithNativePlayer()) {
          // Native player is working, we can update the UI
          setIsPlaying(true);
        } else {
          toast.error("Failed to play audio");
        }
      };
      
      // Add listeners
      audioRef.current.addEventListener('loadedmetadata', metadataHandler);
      audioRef.current.addEventListener('error', errorHandler);
      
      // Add a small delay before playing to ensure audio is properly loaded
      if (autoPlay) {
        const playTimeout = setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.play()
              .then(() => {
                setIsPlaying(true);
                toast.success("Playing recorded audio");
              })
              .catch(async (error) => {
                console.error("Error playing audio:", error);
                
                // Try native player as fallback
                if (await playWithNativePlayer()) {
                  // Native player is working, we can update the UI
                  setIsPlaying(true);
                } else {
                  toast.error("Failed to play audio automatically");
                }
              });
          }
        }, 500);
        
        return () => {
          clearTimeout(playTimeout);
          if (audioRef.current) {
            audioRef.current.removeEventListener('loadedmetadata', metadataHandler);
            audioRef.current.removeEventListener('error', errorHandler);
          }
        };
      }
      
      return () => {
        if (audioRef.current) {
          audioRef.current.removeEventListener('loadedmetadata', metadataHandler);
          audioRef.current.removeEventListener('error', errorHandler);
        }
      };
    }
    
    // Add highlight effect that slowly fades out
    setIsHighlighted(true);
    const highlightTimeout = setTimeout(() => {
      setIsHighlighted(false);
    }, 3000);
    
    return () => clearTimeout(highlightTimeout);
  }, [audioUrl, autoPlay]);
  
  // Update volume when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const handlePlayPause = async () => {
    if (!audioUrl || !audioRef.current) {
      toast.error("No recorded audio available");
      return;
    }
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Error playing audio:", error);
        
        // Try using native player as fallback
        if (await playWithNativePlayer()) {
          // Native player is working, we can update the UI
          setIsPlaying(true);
        } else {
          toast.error("Failed to play audio");
        }
      }
    }
  };
  
  // Handle audio time change (seeking)
  const handleAudioTimeChange = (value: number[]) => {
    if (audioRef.current && audioUrl && !audioError) {
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
  
  // Download the audio file
  const handleDownload = () => {
    if (audioUrl) {
      // Check if we have an Electron environment
      const win = window as any;
      if (win?.electronAPI?.loadAudioFile) {
        // If it's a data URL, we might be able to extract the original path
        if (audioUrl.startsWith('data:')) {
          // Try to get the original path if it's in a custom format we added
          const pathMatch = audioUrl.match(/\?path=(.+)$/);
          if (pathMatch && pathMatch[1]) {
            const originalPath = decodeURIComponent(pathMatch[1]);
            // Use shell to show the file in explorer/finder
            if (win.electronAPI.showItemInFolder) {
              win.electronAPI.showItemInFolder(originalPath);
              return;
            }
          }
        }
      }
      
      // Fall back to browser download
      try {
        const a = document.createElement('a');
        a.href = audioUrl;
        a.download = `recording-${new Date().toISOString().replace(/:/g, '-')}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("Downloading recording");
      } catch (error) {
        console.error("Error downloading audio:", error);
        toast.error("Failed to download recording");
      }
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${isHighlighted ? 'animate-pulse' : ''}`}>
      {audioError && (
        <div className="p-2 mb-2 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-sm text-amber-700">
            Audio playback in browser failed. Use the play button to try native player.
          </p>
          <div className="hidden debug-info-path">{audioUrl}</div>
        </div>
      )}
      
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePlayPause}
          className={`h-10 w-10 rounded-full ${isHighlighted ? 'border-primary' : ''}`}
          disabled={!audioUrl}
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
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-8 w-8 p-0 ml-2"
            title="Download recording"
          >
            <Download className="h-4 w-4" />
          </Button>
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
          disabled={!audioUrl || audioError}
          className={isHighlighted ? 'slider-highlighted' : ''}
        />
      </div>
      
      {/* Audio waveform visualization */}
      {audioUrl && showWaveform && (
        <div className={`h-20 bg-muted rounded-md waveform-bg relative ${isHighlighted ? 'border border-primary/50' : ''}`}>
          {/* Simulated waveform for now */}
          <div className="absolute inset-0 flex items-center px-4">
            <div className="w-full h-16 flex items-center">
              {Array.from({ length: 100 }).map((_, i) => {
                const height = Math.sin(i * 0.2) * 20 + 30;
                const isActive = (i / 100) < (currentAudioTime / (audioDuration || 1));
                return (
                  <div
                    key={i}
                    className={`w-1 mx-0.5 ${isActive ? 'bg-primary' : 'bg-primary-dark opacity-70'}`}
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
    </div>
  );
};

export default AudioPlayer;