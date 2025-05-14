
import { Settings, HelpCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import SettingsDialog from "./settings-dialog";

const AppToolbar = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [liveTranscriptEnabled, setLiveTranscriptEnabled] = useState(false);
  const navigate = useNavigate();
  
  // Load settings from localStorage on mount
  useEffect(() => {
    const settings = localStorage.getItem('friday-settings');
    if (settings) {
      const parsedSettings = JSON.parse(settings);
      setLiveTranscriptEnabled(parsedSettings.liveTranscript || false);
    }
  }, []);
  
  const handleStartRecording = useCallback(() => {
    // Generate a new ID for the transcript
    const newId = `rec-${Date.now()}`;
    
    // Navigate to the transcript page
    navigate(`/transcript/${newId}`);
    
    // Show toast notification
    toast.success("Recording started", {
      description: liveTranscriptEnabled 
        ? "Live transcript is enabled" 
        : "Press ⌘ L to stop recording",
      action: {
        label: "Cancel",
        onClick: () => {
          toast("Recording canceled");
          navigate(-1); // Go back to previous page
        }
      }
    });
    
    // If live transcript is enabled, we would start it here in a real app
    if (liveTranscriptEnabled) {
      console.log("Starting live transcript...");
      // In a real app, this would trigger the live transcription API
    }
  }, [navigate, liveTranscriptEnabled]);

  const handleHelp = useCallback(() => {
    toast.info("Help Center", {
      description: "Press ⌘ ? to open keyboard shortcuts",
    });
  }, []);
  
  const handleSettingsChange = useCallback((settings: any) => {
    // Save settings to localStorage
    localStorage.setItem('friday-settings', JSON.stringify(settings));
    // Update local state
    setLiveTranscriptEnabled(settings.liveTranscript || false);
  }, []);

  return (
    <header className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold">Friday</h1>
      
      <div className="flex items-center gap-3">
        <Button 
          onClick={handleStartRecording}
          className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Mic className="h-4 w-4" />
          Start Recording
        </Button>
        
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setShowSettings(true)}
          className="text-foreground/80 hover:text-foreground rounded-full"
        >
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
        
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleHelp}
          className="text-foreground/80 hover:text-foreground rounded-full"
        >
          <HelpCircle className="h-5 w-5" />
          <span className="sr-only">Help</span>
        </Button>
      </div>
      
      <SettingsDialog 
        open={showSettings} 
        onOpenChange={setShowSettings} 
        onSettingsChange={handleSettingsChange}
      />
    </header>
  );
};

export default AppToolbar;
