import { useEffect, useState } from "react";
import { toast } from "sonner";
import RecordingsTable from "@/components/recordings-table";
import EmptyState from "@/components/empty-state";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { DatabaseService } from "@/services/database";
import { RecordingListItem } from "@/models/types";

const Library = () => {
  const navigate = useNavigate();
  const [recordings, setRecordings] = useState<RecordingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // Load recordings from database
  useEffect(() => {
    const loadRecordings = async () => {
      try {
        setLoading(true);
        
        // First clean up any duplicate meetings
        const cleanupResult = await DatabaseService.cleanupDuplicateMeetings();
        if (cleanupResult.deletedCount > 0) {
          console.log(cleanupResult.message);
          toast.success(`Cleaned up ${cleanupResult.deletedCount} duplicate meetings`);
        }
        
        const data = await DatabaseService.getMeetingsList();
        setRecordings(data);
        setError(null);
      } catch (err) {
        console.error("Error loading recordings:", err);
        setError("Failed to load recordings");
        toast.error("Failed to load recordings");
      } finally {
        setLoading(false);
      }
    };

    // Initialize database and load recordings
    const init = async () => {
      try {
        await DatabaseService.initDatabase();
        await loadRecordings();
      } catch (err) {
        console.error("Error initializing database:", err);
        setError("Failed to initialize database");
        toast.error("Failed to initialize database");
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleCreateNew = () => {
    navigate("/transcript/new", { 
      state: { 
        isNew: true,
        title: "New Meeting",
        description: "",
        tags: [],
        createdAt: new Date(),
        liveTranscript: true
      } 
    });
  };

  const handleRowClick = (id: string) => {
    navigate(`/transcript/${id}`);
  };

  const handleRecordingDeleted = (deletedId: string) => {
    // Remove the deleted recording from the list
    setRecordings(prev => prev.filter(recording => recording.id !== deletedId));
  };

  const handleCleanupDuplicates = async () => {
    setIsCleaningUp(true);
    try {
      const cleanupResult = await DatabaseService.cleanupDuplicateMeetings();
      if (cleanupResult.deletedCount > 0) {
        toast.success(cleanupResult.message);
        // Reload the recordings list
        const data = await DatabaseService.getMeetingsList();
        setRecordings(data);
      } else {
        toast.info(cleanupResult.message);
      }
    } catch (error) {
      console.error("Error cleaning up duplicates:", error);
      toast.error("Failed to clean up duplicate meetings");
    } finally {
      setIsCleaningUp(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Recordings Library</h1>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={handleCleanupDuplicates}
            disabled={isCleaningUp}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isCleaningUp ? 'animate-spin' : ''}`} />
            {isCleaningUp ? 'Cleaning...' : 'Clean Duplicates'}
          </Button>
          <Button 
            onClick={handleCreateNew}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Recording
          </Button>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold text-destructive mb-2">Error</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      ) : recordings.length > 0 ? (
        <RecordingsTable 
          recordings={recordings} 
          onRowClick={handleRowClick}
          onRecordingDeleted={handleRecordingDeleted}
        />
      ) : (
        <EmptyState
          title="No recordings yet"
          description="Start by creating a new recording or importing one from your device."
          action={
            <Button onClick={handleCreateNew}>
              Create New Recording
            </Button>
          }
        />
      )}
    </div>
  );
};

export default Library;
