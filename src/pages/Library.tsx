
import { useEffect, useState } from "react";
import { toast } from "sonner";
import AppToolbar from "@/components/app-toolbar";
import RecordingsTable, { Recording } from "@/components/recordings-table";
import EmptyState from "@/components/empty-state";

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
  
  useEffect(() => {
    // Simulate loading data
    const timer = setTimeout(() => {
      setRecordings(sampleRecordings);
      setShowEmpty(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleStartRecording = () => {
    toast.success("Recording started", {
      description: "Press ⌘ L to stop recording",
      action: {
        label: "Cancel",
        onClick: () => toast("Recording canceled")
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
    <div className="min-h-screen flex flex-col">
      <AppToolbar />
      
      <main className="flex-1 px-6 py-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-medium">Recordings</h2>
          
          {/* This button is just for demo toggling between states */}
          <Button 
            variant="outline" 
            onClick={toggleEmptyState} 
            className="text-xs"
          >
            Toggle Empty State Demo
          </Button>
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
    </div>
  );
};

// This is just for the demo toggle button, would normally be imported
const Button = ({ children, onClick, className, variant }: any) => {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md ${
        variant === "outline" ? "border border-gray-200 hover:bg-gray-50" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
};

export default Library;
