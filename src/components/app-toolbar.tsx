
import { Settings, HelpCircle, Mic, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import SettingsDialog from "./settings-dialog";

const AppToolbar = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [liveTranscriptEnabled, setLiveTranscriptEnabled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Don't show the toolbar on transcript pages
  const isTranscriptPage = location.pathname.includes('/transcript/');
  
  // Load settings from localStorage on mount
  useEffect(() => {
    const settings = localStorage.getItem('friday-settings');
    if (settings) {
      const parsedSettings = JSON.parse(settings);
      setLiveTranscriptEnabled(parsedSettings.liveTranscript || false);
    }
  }, []);
  
  const handleStartRecording = useCallback(() => {
    // Navigate to meeting setup page
    navigate('/meeting/new');
  }, [navigate]);

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

  // Don't render the toolbar on transcript pages
  if (isTranscriptPage) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold">Friday</h1>
      
      <div className="flex items-center gap-3">
        <Button 
          onClick={handleStartRecording}
          className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Meeting
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
