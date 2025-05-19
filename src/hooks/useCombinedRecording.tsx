import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

// Define the window interface with our Electron API
interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    combinedRecording?: {
      startRecording: (options?: { filepath?: string; filename?: string }) => Promise<{ 
        success: boolean; 
        filepath?: string; 
        filename?: string;
        error?: string;
      }>;
      stopRecording: () => Promise<{ success: boolean; error?: string }>;
      onStatusUpdate: (callback: (status: string, timestamp: number, filepath: string, isCombined?: boolean) => void) => void;
      onError: (callback: (errorCode: string) => void) => void;
    };
  };
}

interface UseCombinedRecordingReturn {
  isAvailable: boolean;
  isRecording: boolean;
  recordingPath: string | null;
  recordingDuration: number;
  startRecording: (options?: { filepath?: string; filename?: string }) => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
}

/**
 * A hook for recording both system audio and microphone simultaneously
 */
export default function useCombinedRecording(): UseCombinedRecordingReturn {
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);

  // Check if the combined recording API is available (Electron)
  useEffect(() => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    const isAvailable = !!(
      electronAPI?.isElectron && 
      electronAPI.combinedRecording
    );
    console.log("Combined recording availability check:", isAvailable);
    setIsAvailable(isAvailable);
  }, []);

  // Set up event listeners for recording status
  useEffect(() => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (electronAPI?.combinedRecording) {
      // Listen for recording status updates
      electronAPI.combinedRecording.onStatusUpdate((status, timestamp, filepath, isCombined) => {
        if (status === 'START_RECORDING') {
          console.log("Combined recording started event received");
          setIsRecording(true);
          setRecordingPath(filepath);
          setRecordingStartTime(timestamp);
          toast.success('Combined recording started (system audio + microphone)');
        } else if (status === 'STOP_RECORDING') {
          console.log("Combined recording stopped event received");
          setIsRecording(false);
          setRecordingStartTime(null);
          
          // Update the recording path and show a success message
          setRecordingPath(filepath);
          toast.success('Combined recording saved to: ' + filepath);
        } else if (status === 'CAPTURE_FAILED') {
          console.log("Combined recording capture failed");
          setIsRecording(false);
          setRecordingStartTime(null);
          toast.error('Failed to initialize combined recording. Please check permissions and try again.');
        }
      });

      // Listen for recording errors
      electronAPI.combinedRecording.onError((errorCode) => {
        console.log("Combined recording error:", errorCode);
        setIsRecording(false);
        setRecordingStartTime(null);
        
        if (errorCode === 'FILE_EXISTS') {
          toast.error('Recording failed: File already exists');
        } else if (errorCode === 'START_FAILED') {
          toast.error('Failed to start recording. Please check permissions and try again.');
        } else if (errorCode === 'PERMISSION_DENIED') {
          toast.error('Screen recording permission is required for system audio');
        } else if (errorCode === 'CAPTURE_FAILED') {
          toast.error('Failed to initialize recording components. Please check permissions and try again.');
        } else {
          toast.error(`Recording error: ${errorCode}`);
        }
      });
    }
  }, []);

  // Update recording duration when recording
  useEffect(() => {
    let timer: number | null = null;
    
    if (isRecording && recordingStartTime) {
      timer = window.setInterval(() => {
        const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
        setRecordingDuration(duration);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording, recordingStartTime]);

  // Start recording combined audio
  const startRecording = useCallback(async (options?: { filepath?: string; filename?: string }): Promise<boolean> => {
    console.log("Starting combined recording with options:", options);
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (!electronAPI?.combinedRecording) {
      console.error("Combined recording API not available");
      toast.error('Combined recording is not available on this platform');
      return false;
    }
    
    // Reset state 
    setRecordingDuration(0);
    setRecordingPath(null);
    
    try {
      console.log("Calling Electron API to start combined recording");
      const result = await electronAPI.combinedRecording.startRecording(options);
      console.log("Start combined recording result:", result);
      
      if (!result.success) {
        const errorMessage = result.error || 'Unknown error';
        console.error(`Failed to start combined recording: ${errorMessage}`);
        toast.error(`Failed to start combined recording: ${errorMessage}`);
        return false;
      }
      
      // Note: we don't set isRecording=true here because we wait for the status update event
      console.log("Combined recording request sent successfully");
      return true;
    } catch (error: any) {
      console.error('Error starting combined recording:', error);
      toast.error(`Combined recording error: ${error?.message || 'Unknown error'}`);
      return false;
    }
  }, []);

  // Stop recording combined audio
  const stopRecording = useCallback(async (): Promise<boolean> => {
    console.log("Stopping combined recording");
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (!electronAPI?.combinedRecording) {
      console.error("Combined recording API not available for stopping");
      return false;
    }
    
    try {
      const result = await electronAPI.combinedRecording.stopRecording();
      console.log("Stop combined recording result:", result);
      return result.success;
    } catch (error) {
      console.error('Error stopping combined recording:', error);
      toast.error('Failed to stop combined recording');
      return false;
    }
  }, []);

  return {
    isAvailable,
    isRecording,
    recordingPath,
    recordingDuration,
    startRecording,
    stopRecording
  };
} 