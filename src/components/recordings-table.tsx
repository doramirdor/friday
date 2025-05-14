
import { useState } from "react";
import { format } from "date-fns";
import { PlayCircle, Trash2, Tag, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export interface Recording {
  id: string;
  title: string;
  createdAt: Date;
  duration: number; // in seconds
  tags: string[];
}

interface RecordingsTableProps {
  recordings: Recording[];
  onDelete: (id: string) => void;
}

const RecordingsTable = ({ recordings, onDelete }: RecordingsTableProps) => {
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const navigate = useNavigate();
  
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const handlePlay = (recording: Recording) => {
    toast(`Playing: ${recording.title}`);
  };
  
  const handleDelete = (id: string) => {
    onDelete(id);
    setSelectedRecording(null);
  };
  
  const handleRowClick = (id: string) => {
    navigate(`/transcript/${id}`);
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
              onClick={() => handleRowClick(recording.id)}
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
    </div>
  );
};

export default RecordingsTable;
