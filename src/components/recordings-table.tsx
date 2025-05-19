import { useState } from "react";
import { format } from "date-fns";
import { PlayCircle, Trash2, Tag, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface Recording {
  id: string;
  title: string;
  createdAt: Date;
  duration: number; // in seconds
  tags: string[];
  context?: {
    name: string;
    overrideGlobal: boolean;
  };
}

interface RecordingsTableProps {
  recordings: Recording[];
  onDelete: (id: string) => void;
  onSelect?: (recording: Recording) => void; // New prop for selecting recordings
}

const RecordingsTable = ({ recordings, onDelete, onSelect }: RecordingsTableProps) => {
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [contextName, setContextName] = useState("");
  const [overrideGlobal, setOverrideGlobal] = useState(false);
  const navigate = useNavigate();
  
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const handlePlay = (recording: Recording) => {
    // Call onSelect if provided
    if (onSelect) {
      onSelect(recording);
    }
    toast(`Playing: ${recording.title}`);
  };
  
  const handleDelete = (id: string) => {
    onDelete(id);
    setSelectedRecording(null);
  };
  
  const handleRowClick = (recording: Recording) => {
    // Call onSelect if provided
    if (onSelect) {
      onSelect(recording);
    } else {
      navigate(`/transcript/${recording.id}`);
    }
  };
  
  const handleContextClick = (recording: Recording, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentRecordingId(recording.id);
    setContextName(recording.context?.name || "");
    setOverrideGlobal(recording.context?.overrideGlobal || false);
    setContextDialogOpen(true);
  };
  
  const handleSaveContext = () => {
    // In a real app, this would update the recording's context in your data store
    toast.success("Context settings saved");
    setContextDialogOpen(false);
  };

  return (
    <div className="relative overflow-x-auto rounded-lg">
      <table className="w-full">
        <thead>
          <tr className="text-left border-b">
            <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Title</th>
            <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Created On</th>
            <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Duration</th>
            <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Tags</th>
            <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Context</th>
            <th className="px-6 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {recordings.map((recording) => (
            <tr
              key={recording.id}
              onClick={() => handleRowClick(recording)}
              className="border-b hover:bg-accent/50 cursor-pointer transition-colors"
            >
              <td className="px-6 py-4 font-medium">{recording.title}</td>
              <td className="px-6 py-4 text-muted-foreground">
                {format(recording.createdAt, "MMM d, yyyy 'at' h:mm a")}
              </td>
              <td className="px-6 py-4 text-muted-foreground">
                {formatDuration(recording.duration)}
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  {recording.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="px-2 py-0.5 text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </td>
              <td className="px-6 py-4" onClick={(e) => handleContextClick(recording, e)}>
                <Button variant="ghost" size="sm" className="flex items-center gap-1.5">
                  <File className="h-4 w-4" />
                  <span>{recording.context?.name || "Default"}</span>
                  {recording.context?.overrideGlobal && (
                    <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">Override</Badge>
                  )}
                </Button>
              </td>
              <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handlePlay(recording)}
                    className="h-8 w-8 p-0"
                  >
                    <PlayCircle className="h-5 w-5" />
                    <span className="sr-only">Play</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedRecording(recording)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-5 w-5" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!selectedRecording} onOpenChange={(open) => !open && setSelectedRecording(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to move "{selectedRecording?.title}" to the Trash? You can restore it from the Trash later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => selectedRecording && handleDelete(selectedRecording.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Context Dialog */}
      <Dialog open={contextDialogOpen} onOpenChange={setContextDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Context Settings</DialogTitle>
            <DialogDescription>
              Set the context for this recording. Context provides additional information for transcription.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="context-name">Context Name</Label>
              <Input
                id="context-name"
                value={contextName}
                onChange={(e) => setContextName(e.target.value)}
                placeholder="Enter context name"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="override-global"
                checked={overrideGlobal}
                onCheckedChange={setOverrideGlobal}
              />
              <Label htmlFor="override-global">
                Override global context
              </Label>
            </div>
            
            <p className="text-sm text-muted-foreground">
              When enabled, this recording will use its own context instead of the global one.
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setContextDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveContext}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecordingsTable;
