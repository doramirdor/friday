import { useEffect, useState } from "react";
import { toast } from "sonner";
import RecordingsTable, { Recording } from "@/components/recordings-table";
import EmptyState from "@/components/empty-state";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

// Sample data
const sampleRecordings: Recording[] = [
  {
    id: "1",
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
  const [showEmpty, setShowEmpty] = useState(true);
  const navigate = useNavigate();
  
  useEffect(() => {
    // Simulate loading data
    const timer = setTimeout(() => {
      setRecordings(sampleRecordings);
      setShowEmpty(false);
    }, 1000);
    
    return () => clearTimeout(timer);
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
  };
  
  // We're toggling between normal and empty state for demo purposes
  const toggleEmptyState = () => {
    setShowEmpty(!showEmpty);
  };

  return (
    <main className="flex-1 px-6 py-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-medium">Recordings</h2>
        
        <div className="flex gap-3">
          {/* Updated button to go directly to transcript page */}
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
        <RecordingsTable 
          recordings={recordings}
          onDelete={handleDeleteRecording}
        />
      )}
    </main>
  );
};

export default Library;
