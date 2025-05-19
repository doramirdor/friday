
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

interface AudioPlayerProps {
  audioUrl: string | null;
  autoPlay?: boolean;
}

const AudioPlayer = ({ audioUrl, autoPlay = true }: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentAudioTime, setCurrentAudioTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(80);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
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
        URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = null;
      }
    };
  }, []);
  
  // Update audio source when audioUrl changes and play automatically if autoPlay is true
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      
      // Add a small delay before playing to ensure audio is properly loaded
      if (autoPlay) {
        const playTimeout = setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.play()
              .then(() => {
                setIsPlaying(true);
                toast.success("Playing recorded audio");
              })
              .catch(error => {
                console.error("Error playing audio:", error);
                toast.error("Failed to play audio automatically");
              });
          }
        }, 500);
        
        return () => clearTimeout(playTimeout);
      }
    }
  }, [audioUrl, autoPlay]);
  
  // Update volume when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const handlePlayPause = () => {
    if (!audioUrl || !audioRef.current) {
      toast.error("No recorded audio available");
      return;
    }
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play()
        .then(() => {
          // Play successful
        })
        .catch(error => {
          console.error("Error playing audio:", error);
          toast.error("Failed to play audio");
        });
    }
    
    setIsPlaying(!isPlaying);
  };
  
  // Handle audio time change (seeking)
  const handleAudioTimeChange = (value: number[]) => {
    if (audioRef.current && audioUrl) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePlayPause}
          className="h-10 w-10 rounded-full"
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
          disabled={!audioUrl}
        />
      </div>
      
      {/* Audio waveform visualization */}
      {audioUrl && (
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
    </div>
  );
};

export default AudioPlayer;