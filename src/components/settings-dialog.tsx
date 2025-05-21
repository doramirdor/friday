import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Settings, Keyboard, Mic, Info, File } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTheme } from "@/components/theme-provider"
import ContextSettings from "@/components/context-settings"
import { AudioDeviceInfo } from "@/components/audio-device-info"
import { useState, useEffect } from "react"
import useSettings from "@/hooks/useSettings"
import { UserSettings } from "@/models/types"
import { toast } from "sonner"

// Define dialog props interface
interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSettingsChange?: (settings: Partial<UserSettings>) => void
}

const SettingsDialog = ({ open, onOpenChange, onSettingsChange }: SettingsDialogProps) => {
  const { theme, setTheme } = useTheme()
  const { settings, isLoading, updateSettings } = useSettings()
  const [apiKey, setApiKey] = useState<string>('')
  
  // Load settings when the component mounts or when settings are updated
  useEffect(() => {
    if (settings) {
      // Update API key field
      setApiKey(settings.apiKey || '')
    }
  }, [settings])
  
  // Handle live transcript toggle
  const handleLiveTranscriptChange = async (checked: boolean) => {
    if (!settings) return
    
    try {
      await updateSettings({ liveTranscript: checked })
      
      // Notify parent component of change
      if (onSettingsChange) {
        onSettingsChange({ liveTranscript: checked })
      }
      
      toast.success("Live transcript setting saved")
    } catch (err) {
      toast.error("Failed to save live transcript setting")
    }
  }
  
  // Handle API key change
  const handleApiKeySave = async () => {
    if (!settings) return
    
    try {
      await updateSettings({ apiKey })
      toast.success("API key saved")
    } catch (err) {
      toast.error("Failed to save API key")
    }
  }
  
  // Handle theme change
  const handleThemeChange = async (newTheme: "light" | "dark" | "system") => {
    if (!settings) return
    
    // Update theme provider
    setTheme(newTheme)
    
    // Save to database
    try {
      await updateSettings({ theme: newTheme })
    } catch (err) {
      console.error("Failed to save theme setting:", err)
    }
  }
  
  // Handle auto launch toggle
  const handleAutoLaunchChange = async (checked: boolean) => {
    if (!settings) return
    
    try {
      await updateSettings({ autoLaunch: checked })
      toast.success("Auto launch setting saved")
    } catch (err) {
      toast.error("Failed to save auto launch setting")
    }
  }
  
  // Handle save location change
  const handleSaveLocationChange = async (location: string) => {
    if (!settings) return
    
    try {
      await updateSettings({ saveLocation: location })
      toast.success("Save location updated")
    } catch (err) {
      toast.error("Failed to update save location")
    }
  }
  
  // Show loading state if settings aren't loaded yet
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl">Settings</DialogTitle>
            <DialogDescription>Loading settings...</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 max-h-[80vh] h-[600px] overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>
            Customize Friday to match your workflow
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="w-full h-full flex flex-col">
          <TabsList className="w-full justify-start border-b rounded-none px-6 h-12 shrink-0">
            <TabsTrigger value="general" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex gap-2 items-center">
              <Settings className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="shortcuts" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex gap-2 items-center">
              <Keyboard className="w-4 h-4" />
              Shortcuts
            </TabsTrigger>
            <TabsTrigger value="transcription" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex gap-2 items-center">
              <Mic className="w-4 h-4" />
              Transcription
            </TabsTrigger>
            <TabsTrigger value="context" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex gap-2 items-center">
              <File className="w-4 h-4" />
              Context
            </TabsTrigger>
            <TabsTrigger value="about" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex gap-2 items-center">
              <Info className="w-4 h-4" />
              About
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="general" className="p-6 pt-4 h-auto mt-0 block">
              <div className="space-y-6 pb-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Save Location</h3>
                  <div className="flex items-center gap-2">
                    <Input 
                      value={settings?.saveLocation || "/Users/you/Documents/Friday Recordings"} 
                      onChange={(e) => handleSaveLocationChange(e.target.value)}
                    />
                    <Button variant="outline" size="sm">Change...</Button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="auto-launch" className="flex flex-col gap-0.5">
                    <span>Launch at startup</span>
                    <span className="text-sm text-muted-foreground font-normal">Friday will open automatically when you log in</span>
                  </Label>
                  <Switch 
                    id="auto-launch"
                    checked={settings?.autoLaunch || false}
                    onCheckedChange={handleAutoLaunchChange}
                  />
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Theme</h3>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant={theme === "light" ? "default" : "outline"}
                      onClick={() => handleThemeChange("light")}
                      className="w-24"
                    >
                      Light
                    </Button>
                    <Button 
                      variant={theme === "dark" ? "default" : "outline"}
                      onClick={() => handleThemeChange("dark")}
                      className="w-24"
                    >
                      Dark
                    </Button>
                    <Button 
                      variant={theme === "system" ? "default" : "outline"}
                      onClick={() => handleThemeChange("system")}
                      className="w-24"
                    >
                      Auto
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="shortcuts" className="p-6 pt-4 h-auto mt-0 block">
              <div className="space-y-6 pb-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Global Shortcuts</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span>Start New Recording</span>
                      <div className="flex items-center">
                        <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">⌘</kbd>
                        <span className="mx-1">+</span>
                        <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">Shift</kbd>
                        <span className="mx-1">+</span>
                        <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">R</kbd>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Open Settings</span>
                      <div className="flex items-center">
                        <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">⌘</kbd>
                        <span className="mx-1">+</span>
                        <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">,</kbd>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Editor</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span>Save Transcript</span>
                      <div className="flex items-center">
                        <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">⌘</kbd>
                        <span className="mx-1">+</span>
                        <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">S</kbd>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="transcription" className="p-6 pt-4 h-auto mt-0 block">
              <div className="space-y-6 pb-20">
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="live-transcription" className="flex flex-col gap-0.5">
                    <span>Live Transcription</span>
                    <span className="text-sm text-muted-foreground font-normal">Convert speech to text in real-time as you record</span>
                  </Label>
                  <Switch 
                    id="live-transcription" 
                    checked={settings?.liveTranscript || false}
                    onCheckedChange={handleLiveTranscriptChange}
                  />
                </div>
                
                <div className="space-y-3">
                  <Label htmlFor="api-key" className="text-sm font-medium">API Key</Label>
                  <div className="flex gap-2">
                    <Input 
                      type="password" 
                      id="api-key" 
                      placeholder="Enter your API key" 
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <Button onClick={handleApiKeySave} size="sm">Save</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Your API key is stored locally and never shared</p>
                </div>
                
                <div className="border-t my-4 pt-4">
                  <h3 className="text-sm font-medium mb-4">Audio Devices</h3>
                  <AudioDeviceInfo />
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="context" className="p-6 pt-4 h-auto mt-0 block">
              <ContextSettings />
            </TabsContent>
            
            <TabsContent value="about" className="p-6 pt-4 h-auto mt-0 block">
              <div className="space-y-4 text-center">
                <div>
                  {/* <h3 className="text-lg font-medium">Friday</h3> */}
                  <div className="flex justify-center mb-4">
                    <img src="/fridayLogo.png" alt="Friday Logo" className="w-60 h-20" />
                  </div>
                  <p className="text-sm text-muted-foreground">Version 0.3.1</p>
                </div>
                
                <p className="text-sm">
                  Friday is an AI-powered meeting assistant that records, transcribes, and organizes your meetings.
                </p>
                
                <div className="pt-4">
                  <Button variant="outline">Check for Updates</Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
