import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Settings, Keyboard, Mic, Info, File } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTheme } from "@/components/theme-provider"
import ContextSettings from "@/components/context-settings"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { theme, setTheme } = useTheme()
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>
            Customize Friday to match your workflow
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none px-6 h-12">
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
          
          <TabsContent value="general" className="p-6 pt-4">
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Save Location</h3>
                <div className="flex items-center gap-2">
                  <Input value="/Users/you/Documents/Friday Recordings" readOnly />
                  <Button variant="outline" size="sm">Change...</Button>
                </div>
              </div>
              
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="auto-launch" className="flex flex-col gap-0.5">
                  <span>Launch at startup</span>
                  <span className="text-sm text-muted-foreground font-normal">Friday will open automatically when you log in</span>
                </Label>
                <Switch id="auto-launch" />
              </div>
              
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Theme</h3>
                <div className="flex items-center gap-3">
                  <Button 
                    variant={theme === "light" ? "default" : "outline"}
                    onClick={() => setTheme("light")}
                    className="w-24"
                  >
                    Light
                  </Button>
                  <Button 
                    variant={theme === "dark" ? "default" : "outline"}
                    onClick={() => setTheme("dark")}
                    className="w-24"
                  >
                    Dark
                  </Button>
                  <Button 
                    variant={theme === "system" ? "default" : "outline"}
                    onClick={() => setTheme("system")}
                    className="w-24"
                  >
                    Auto
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="shortcuts" className="p-6 pt-4">
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Global Hotkeys</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span>Start/Stop Recording</span>
                    <div className="flex items-center">
                      <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">⌘</kbd>
                      <span className="mx-1">+</span>
                      <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">L</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Open Friday</span>
                    <div className="flex items-center">
                      <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">⌘</kbd>
                      <span className="mx-1">+</span>
                      <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">⇧</kbd>
                      <span className="mx-1">+</span>
                      <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded border">F</kbd>
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
          
          <TabsContent value="transcription" className="p-6 pt-4">
            <div className="space-y-6">
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="live-transcription" className="flex flex-col gap-0.5">
                  <span>Live Transcription</span>
                  <span className="text-sm text-muted-foreground font-normal">Convert speech to text in real-time as you record</span>
                </Label>
                <Switch id="live-transcription" defaultChecked />
              </div>
              
              <div className="space-y-3">
                <Label htmlFor="api-key" className="text-sm font-medium">Gemini API Key</Label>
                <Input type="password" id="api-key" placeholder="Enter your API key" />
                <p className="text-xs text-muted-foreground">Your API key is stored locally and never shared</p>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="context" className="p-6 pt-4">
            <ContextSettings />
          </TabsContent>
          
          <TabsContent value="about" className="p-6 pt-4">
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center text-center gap-4 py-6">
                <div className="bg-primary text-white rounded-2xl h-24 w-24 flex items-center justify-center">
                  <span className="text-3xl font-bold">F</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Friday</h3>
                  <p className="text-sm text-muted-foreground">Version 1.0.0</p>
                </div>
                <Button variant="outline" size="sm">Check for Updates</Button>
              </div>
              
              <div className="flex justify-center space-x-4">
                <Button variant="link">Privacy Policy</Button>
                <Button variant="link">Terms of Service</Button>
                <Button variant="link">Support</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog
