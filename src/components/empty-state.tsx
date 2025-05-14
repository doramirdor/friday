
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onStartRecording: () => void;
}

const EmptyState = ({ onStartRecording }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="bg-muted rounded-full p-6 mb-6">
        <Mic className="h-12 w-12 text-primary" />
      </div>
      <h2 className="text-2xl font-medium mb-2">No recordings yet</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Press <kbd className="px-2 py-0.5 text-xs font-semibold bg-muted rounded border mx-1">⌘</kbd>
        <kbd className="px-2 py-0.5 text-xs font-semibold bg-muted rounded border mx-1">L</kbd> 
        to start your first recording or click the button below
      </p>
      <Button 
        onClick={onStartRecording}
        className="bg-primary hover:bg-primary-light text-white px-4 py-2 flex items-center gap-2"
      >
        <Mic className="h-4 w-4" />
        Start Recording
      </Button>
    </div>
  );
};

export default EmptyState;
