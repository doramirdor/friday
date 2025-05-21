import { Settings, HelpCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import SettingsDialog from "./settings-dialog";
import NewMeetingDialog from "./new-meeting-dialog";
import useSettings from "@/hooks/useSettings";
import { UserSettings } from "@/models/types";

const AppToolbar = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Don't show the toolbar on transcript pages
  const isTranscriptPage = location.pathname.includes('/transcript/');
  
  const handleHelp = useCallback(() => {
    toast.info("Help Center", {
      description: "Press ⌘ ? to open keyboard shortcuts",
    });
  }, []);
  
  const handleSettingsChange = useCallback((newSettings: Partial<UserSettings>) => {
    // The settings are already saved in the database by the SettingsDialog component
    // We just need to update any UI that depends on the settings
    console.log("Settings changed:", newSettings);
  }, []);

  // Don't render the toolbar on transcript pages
  if (isTranscriptPage) {
    return null;
  }
  
  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 p-4 bg-background/80 backdrop-blur-md border-t">
      <div className="container flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            onClick={handleHelp}
          >
            <HelpCircle className="h-4 w-4" />
            <span className="sr-only">Help</span>
          </Button>
        </div>
        
        <div>
          <Button
            size="sm"
            className="h-8 px-3 rounded-full"
            onClick={() => setShowNewMeeting(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            <span>New Meeting</span>
          </Button>
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog 
        open={showSettings} 
        onOpenChange={setShowSettings}
        onSettingsChange={handleSettingsChange}
      />
      
      {/* New Meeting Dialog */}
      <NewMeetingDialog
        open={showNewMeeting}
        onOpenChange={setShowNewMeeting}
        initialLiveTranscript={settings?.liveTranscript || false}
      />
    </div>
  );
};

export default AppToolbar;
