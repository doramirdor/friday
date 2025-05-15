import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import useGoogleSpeech from "@/hooks/useGoogleSpeech";
import { toast } from "sonner";

interface AudioTestButtonProps {
  className?: string;
}

interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    appPath?: string;
  }
}

export function AudioTestButton({ className }: AudioTestButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const { testWithFile } = useGoogleSpeech();
  
  // Check if we're running in Electron
  useEffect(() => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    setIsElectron(!!electronAPI?.isElectron);
  }, []);
  
  const handleTestWav = async () => {
    setIsLoading(true);
    try {
      // Use electron app's resource path for test files if available
      const filePath = isElectron && (window as unknown as ElectronWindow).electronAPI?.appPath
        ? `${(window as unknown as ElectronWindow).electronAPI.appPath}/test-audio/test-speech.wav`
        : './test-audio/test-speech.wav';
        
      console.log('🧪 Testing with WAV file:', filePath);
      await testWithFile(filePath);
    } catch (error) {
      console.error('Error testing WAV file:', error);
      toast.error('Failed to test WAV file');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleTestMp3 = async () => {
    setIsLoading(true);
    try {
      // Use electron app's resource path for test files if available
      const filePath = isElectron && (window as unknown as ElectronWindow).electronAPI?.appPath
        ? `${(window as unknown as ElectronWindow).electronAPI.appPath}/test-audio/test-speech.mp3`
        : './test-audio/test-speech.mp3';
      
      console.log('🧪 Testing with MP3 file:', filePath);
      await testWithFile(filePath);
    } catch (error) {
      console.error('Error testing MP3 file:', error);
      toast.error('Failed to test MP3 file');
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
        Test WAV File {!isElectron && "(Dev Mode)"}
      </Button>
      <Button 
        onClick={handleTestMp3} 
        variant="outline" 
        disabled={isLoading}
        size="sm"
      >
        Test MP3 File {!isElectron && "(Dev Mode)"}
      </Button>
    </div>
  );
} 