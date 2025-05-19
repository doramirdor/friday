import { useEffect, useState } from "react";
import { toast } from "sonner";
import RecordingsTable, { Recording } from "@/components/recordings-table";
import EmptyState from "@/components/empty-state";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import { Card } from "@/components/ui/card";

// Sample data
const sampleRecordings: Recording[] = [
  {
    id: "123", // Changed ID to "123" for our mock transcript
    title: "Weekly Team Standup",
    createdAt: new Date("2025-05-12T09:30:00"),
    duration: 1845, // 30:45
    tags: ["meeting", "team"]
  },
  {
    id: "2",
    title: "Interview with Product Manager",
    createdAt: new Date("2025-05-10T14:15:00"),
    duration: 3615, // 1:00:15
    tags: ["interview", "research"]
  },
  {
    id: "3",
    title: "Marketing Strategy Brainstorm",
    createdAt: new Date("2025-05-08T13:00:00"),
    duration: 2730, // 45:30
    tags: ["marketing", "planning"]
  }
];

const Library = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [showEmpty, setShowEmpty] = useState(false); // Changed to false to show recordings by default
  const navigate = useNavigate();
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  
  // Create a sample audio URL for demo purposes
  const demoAudioUrl = "https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3";
  
  useEffect(() => {
    // Load sample data immediately instead of empty state
    setRecordings(sampleRecordings);
    // Auto-select the first recording for demo purposes
    setSelectedRecording(sampleRecordings[0]);
  }, []);
  
  const handleStartRecording = () => {
    // Navigate directly to transcript page with "new" state
    navigate('/transcript/new', {
      state: {
        title: "New Meeting",
        description: "",
        tags: [],
        createdAt: new Date(),
        isNew: true
      }
    });
  };
  
  const handleDeleteRecording = (id: string) => {
    setRecordings((prev) => prev.filter((recording) => recording.id !== id));
    toast.success("Recording moved to trash");
    
    if (recordings.length === 1) {
      setShowEmpty(true);
    }
    
    // Clear selection if the deleted recording was selected
    if (selectedRecording && selectedRecording.id === id) {
      setSelectedRecording(null);
    }
  };
  
  // We're toggling between normal and empty state for demo purposes
  const toggleEmptyState = () => {
    setShowEmpty(!showEmpty);
  };
  
  // Open existing recording with transcript
  const handleOpenRecording = (id: string) => {
    // Special handling for mock transcript
    if (id === "123") {
      navigate(`/transcript/123`);
    } else {
      navigate(`/transcript/${id}`);
    }
  };
  
  // Select a recording to preview
  const handleSelectRecording = (recording: Recording) => {
    setSelectedRecording(recording);
  };

  return (
    <main className="flex-1 px-6 py-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-medium">Recordings</h2>
        
        <div className="flex gap-3">
          <Button 
            onClick={handleStartRecording}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Meeting
          </Button>
          
          {/* This button is just for demo toggling between states */}
          <Button 
            variant="outline" 
            onClick={toggleEmptyState} 
            className="text-xs"
          >
            Toggle Empty State Demo
          </Button>
        </div>
      </div>
      
      {showEmpty ? (
        <EmptyState onStartRecording={handleStartRecording} />
      ) : (
        <>
          {/* Add demo audio player */}
          <Card className="mb-6 p-6">
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">
                {selectedRecording ? selectedRecording.title : "Demo Recording"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Listen to the selected recording or try the controls below.
              </p>
              <AudioPlayer audioUrl={demoAudioUrl} autoPlay={false} />
            </div>
          </Card>
          
          <RecordingsTable 
            recordings={recordings}
            onDelete={handleDeleteRecording}
            onSelect={handleSelectRecording}
          />
        </>
      )}
    </main>
  );
};

export default Library;
