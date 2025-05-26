import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import { ChevronLeft, Mic } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

const MeetingSetup = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("New Meeting");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [liveTranscription, setLiveTranscription] = useState(false);
  
  // Check if live transcription is enabled in settings
  React.useEffect(() => {
    const settings = localStorage.getItem('friday-settings');
    if (settings) {
      const parsedSettings = JSON.parse(settings);
      setLiveTranscription(parsedSettings.liveTranscript || false);
    }
  }, []);
  
  const handleStartMeeting = () => {
    if (!title.trim()) {
      toast.error("Please provide a meeting title");
      return;
    }
    
    // Generate a unique ID for the meeting with timestamp and random component
    const newId = `meeting_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Navigate to the transcript page with the new ID and meeting info
    navigate(`/transcript/${newId}`, {
      state: {
        title,
        description,
        tags,
        createdAt: new Date(),
        isNew: true,
        liveTranscript: liveTranscription
      }
    });
    
    toast.success(`Recording started: ${title}`, {
      description: liveTranscription 
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
  };

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
        
        <h1 className="text-xl font-semibold flex-1">New Meeting</h1>
      </header>
      
      <main className="flex-1 container max-w-3xl py-8 px-4">
        <div className="space-y-8">
          <div className="space-y-3">
            <Label htmlFor="title" className="text-base">Meeting Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter meeting title"
              className="text-lg"
            />
          </div>
          
          <div className="space-y-3">
            <Label htmlFor="description" className="text-base">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this meeting about?"
              className="min-h-24"
            />
          </div>
          
          <div className="space-y-3">
            <Label htmlFor="tags" className="text-base">Tags (Optional)</Label>
            <TagInput
              id="tags"
              tags={tags}
              onTagsChange={setTags}
              placeholder="Add tag..."
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              Add tags to categorize your meeting
            </p>
          </div>
          
          <div className="flex items-center justify-between bg-accent/30 rounded-lg p-4">
            <div className="space-y-1">
              <Label htmlFor="live-transcript">Live Transcription</Label>
              <p className="text-sm text-muted-foreground">
                Convert speech to text in real-time during the recording
              </p>
            </div>
            <Switch 
              id="live-transcript" 
              checked={liveTranscription}
              onCheckedChange={setLiveTranscription}
            />
          </div>
          
          <div className="pt-6 flex justify-center">
            <Button
              onClick={handleStartMeeting}
              size="lg"
              className="bg-primary hover:bg-primary-light text-white px-8 py-6 rounded-lg flex items-center gap-3 transition-colors text-lg h-auto"
            >
              <Mic className="h-5 w-5" />
              Start Meeting
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MeetingSetup;
