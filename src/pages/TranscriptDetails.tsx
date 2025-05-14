
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Play, Pause } from "lucide-react";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface TranscriptLine {
  id: string;
  time: number; // in seconds
  text: string;
  isEditing?: boolean;
}

interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
}

const TranscriptDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [title, setTitle] = useState("Weekly Team Standup");
  const [description, setDescription] = useState("Discussion about current project status and next steps.");
  const [tags, setTags] = useState<string[]>(["meeting", "team"]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([
    { id: "a1", text: "Follow up with design team about UI changes", completed: false },
    { id: "a2", text: "Schedule retrospective for Friday", completed: true },
  ]);
  const [newActionItem, setNewActionItem] = useState("");
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentLineId, setCurrentLineId] = useState("l2");
  
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([
    { id: "l1", time: 0, text: "Hey everyone, thanks for joining today's standup." },
    { id: "l2", time: 5, text: "Let's go around the room and share updates on what we've been working on." },
    { id: "l3", time: 12, text: "Sarah, would you like to go first?" },
    { id: "l4", time: 15, text: "Sure. I've been working on the new dashboard design and it's about 80% complete." },
    { id: "l5", time: 23, text: "I'm planning to send it for review by end of day." },
    { id: "l6", time: 28, text: "Great. And do you foresee any blockers that might prevent you from finishing today?" },
    { id: "l7", time: 35, text: "No blockers at the moment, just need to finish up some minor details." },
    { id: "l8", time: 40, text: "Perfect. Let's move on to Michael." },
  ]);
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    
    // Simulate playback with progress
    if (!isPlaying) {
      toast.success("Playing recording");
      // In a real app, this would control actual audio playback
    } else {
      toast.info("Paused recording");
    }
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
  
  const handleSave = () => {
    toast.success("Changes saved successfully");
  };
  
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-background border-b border-border px-6 py-4 flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate("/")}
          className="h-8 w-8 p-0 rounded-full"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">Back</span>
        </Button>
        
        <h1 className="text-xl font-semibold flex-1">{title}</h1>
        
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
      
      <div className="flex flex-1 overflow-hidden">
        {/* Main transcript area - 72% */}
        <div className="flex flex-col w-[72%] overflow-hidden">
          {/* Waveform player */}
          <div className="p-6 border-b border-r">
            <div className="flex items-center gap-4 mb-4">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePlayPause}
                className="h-10 w-10 rounded-full"
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
                {formatTime(currentTime)} / 01:30
              </div>
            </div>
            
            <div className="h-24 bg-muted rounded-md waveform-bg relative">
              {/* Simulated waveform */}
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
                style={{ left: "30%" }}
              />
            </div>
          </div>
          
          {/* Transcript lines */}
          <div className="flex-1 overflow-y-auto p-6 border-r">
            <div className="space-y-4">
              {transcriptLines.map((line) => (
                <div 
                  key={line.id}
                  className={`p-2 rounded-md ${
                    line.id === currentLineId 
                      ? "bg-primary/10 border-l-2 border-primary" 
                      : "hover:bg-accent/50"
                  }`}
                  onClick={() => handleLineClick(line)}
                >
                  {line.isEditing ? (
                    <div className="flex gap-2">
                      <span className="font-mono text-xs text-muted-foreground pt-2 w-10">
                        {formatTime(line.time)}
                      </span>
                      <Input
                        value={line.text}
                        onChange={(e) => handleLineEdit(line.id, e.target.value)}
                        autoFocus
                        onBlur={() => {
                          setTranscriptLines(
                            transcriptLines.map(l => 
                              l.id === line.id ? { ...l, isEditing: false } : l
                            )
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleLineEdit(line.id, (e.target as HTMLInputElement).value);
                          }
                        }}
                        className="flex-1"
                      />
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <span className="font-mono text-xs text-muted-foreground pt-1 w-10">
                        {formatTime(line.time)}
                      </span>
                      <p>{line.text}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Inspector sidebar - 28% */}
        <div className="w-[28%] p-6 border-l overflow-y-auto space-y-6">
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
          
          <div className="space-y-4">
            <Label htmlFor="action-items">Action Items</Label>
            <div className="space-y-2">
              {actionItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2"
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
                    } cursor-pointer text-sm`}
                  >
                    {item.text}
                  </Label>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2">
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
        </div>
      </div>
    </div>
  );
};

export default TranscriptDetails;
