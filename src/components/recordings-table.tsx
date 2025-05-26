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
import { RecordingListItem } from "@/models/types";
import { DatabaseService } from "@/services/database";

interface RecordingsTableProps {
  recordings: RecordingListItem[];
  onRowClick: (id: string) => void;
  onRecordingDeleted?: (id: string) => void; // Add callback for when a recording is deleted
}

const RecordingsTable = ({ recordings, onRowClick, onRecordingDeleted }: RecordingsTableProps) => {
  const [selectedRecording, setSelectedRecording] = useState<RecordingListItem | null>(null);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [contextName, setContextName] = useState("");
  const [overrideGlobal, setOverrideGlobal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const handlePlay = (recording: RecordingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    toast(`Playing: ${recording.title}`);
  };
  
  const handleDelete = async (id: string) => {
    if (isDeleting) return;
    
    setIsDeleting(true);
    
    try {
      // Delete the meeting and all associated data
      await DatabaseService.deleteMeeting(id);
      
      // Notify parent component about the deletion
      if (onRecordingDeleted) {
        onRecordingDeleted(id);
      }
      
      toast.success("Meeting moved to trash successfully");
      setSelectedRecording(null);
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error("Failed to delete meeting. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleContextClick = (recording: RecordingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentRecordingId(recording.id);
    setContextName("Default"); // We'll implement context retrieval later
    setOverrideGlobal(false);
    setContextDialogOpen(true);
  };
  
  const handleSaveContext = () => {
    // Future implementation: Save context to database
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
            <th className="px-6 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {recordings.map((recording) => (
            <tr
              key={recording.id}
              onClick={() => onRowClick(recording.id)}
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
              <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => handlePlay(recording, e)}
                    className="h-8 w-8 p-0"
                  >
                    <PlayCircle className="h-5 w-5" />
                    <span className="sr-only">Play</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRecording(recording);
                    }}
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
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => selectedRecording && handleDelete(selectedRecording.id)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Move to Trash"}
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
