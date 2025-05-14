
import { Settings, HelpCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import SettingsDialog from "./settings-dialog";

const AppToolbar = () => {
  const [showSettings, setShowSettings] = useState(false);
  
  const handleStartRecording = useCallback(() => {
    toast.success("Recording started", {
      description: "Press ⌘ L to stop recording",
      action: {
        label: "Cancel",
        onClick: () => toast("Recording canceled")
      }
    });
  }, []);

  const handleHelp = useCallback(() => {
    toast.info("Help Center", {
      description: "Press ⌘ ? to open keyboard shortcuts",
    });
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
      
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </header>
  );
};

export default AppToolbar;
