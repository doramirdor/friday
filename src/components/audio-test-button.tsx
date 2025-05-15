import { Button } from "@/components/ui/button";
import { useState } from "react";
import useGoogleSpeech from "@/hooks/useGoogleSpeech";

interface AudioTestButtonProps {
  className?: string;
}

export function AudioTestButton({ className }: AudioTestButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { testWithFile } = useGoogleSpeech();
  
  const handleTestWav = async () => {
    setIsLoading(true);
    try {
      const filePath = '/Users/amirdor/Library/Application Support/Friday/recording-2025-05-14T00-30-13-366Z.wav';
      await testWithFile(filePath);
    } catch (error) {
      console.error('Error testing WAV file:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleTestMp3 = async () => {
    setIsLoading(true);
    try {
      const filePath = '/Users/amirdor/Library/Application Support/Friday/recording-2025-05-14T00-30-13-366Z.mps';
      await testWithFile(filePath);
    } catch (error) {
      console.error('Error testing MP3 file:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <Button 
        onClick={handleTestWav} 
        variant="outline" 
        disabled={isLoading}
        size="sm"
      >
        Test WAV File
      </Button>
      <Button 
        onClick={handleTestMp3} 
        variant="outline" 
        disabled={isLoading}
        size="sm"
      >
        Test MP3 File
      </Button>
    </div>
  );
} 