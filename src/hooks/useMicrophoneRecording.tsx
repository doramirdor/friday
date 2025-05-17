import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import path from 'path';
import fs from 'fs';

// Define the window interface with our Electron API
interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    micRecording: {
      startRecording: (options?: { filepath?: string; filename?: string }) => Promise<{ 
        success: boolean; 
        filepath?: string; 
        filename?: string;
        error?: string;
      }>;
      stopRecording: () => Promise<{ success: boolean; error?: string }>;
      onStatusUpdate: (callback: (status: string, timestamp: number, filepath: string) => void) => void;
      onError: (callback: (errorCode: string) => void) => void;
    };
    saveAudioFile: (file: Buffer, filename: string, formats: string[]) => Promise<{ success: boolean; files?: Record<string, string> }>;
  };
}

interface UseMicrophoneRecordingReturn {
  isAvailable: boolean;
  isRecording: boolean;
  recordingPath: string | null;
  recordingDuration: number;
  startRecording: (options?: { filepath?: string; filename?: string }) => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
}

/**
 * A hook for recording from the microphone
 */
export default function useMicrophoneRecording(): UseMicrophoneRecordingReturn {
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);

  // Check if the microphone recording API is available (Electron)
  useEffect(() => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    const isAvailable = !!(
      electronAPI?.isElectron && 
      electronAPI.micRecording
    );
    console.log("Microphone recording availability check:", isAvailable);
    setIsAvailable(isAvailable);
  }, []);

  // Set up event listeners for recording status
  useEffect(() => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (electronAPI?.micRecording) {
      // Listen for recording status updates
      electronAPI.micRecording.onStatusUpdate(async (status, timestamp, filepath) => {
        if (status === 'START_RECORDING') {
          console.log("Microphone recording started event received");
          setIsRecording(true);
          setRecordingPath(filepath);
          setRecordingStartTime(timestamp);
          toast.success('Microphone recording started');
        } else if (status === 'STOP_RECORDING') {
          console.log("Microphone recording stopped event received");
          setIsRecording(false);
          setRecordingStartTime(null);
          
          // Update the recording path and show a success message
          setRecordingPath(filepath);
          toast.success('Recording saved to: ' + filepath);
        }
      });

      // Listen for recording errors
      electronAPI.micRecording.onError((errorCode) => {
        console.log("Microphone recording error:", errorCode);
        setIsRecording(false);
        setRecordingStartTime(null);
        
        if (errorCode === 'FILE_EXISTS') {
          toast.error('Recording failed: File already exists');
        } else if (errorCode === 'START_FAILED') {
          toast.error('Failed to start recording');
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

  // Start recording microphone
  const startRecording = useCallback(async (options?: { filepath?: string; filename?: string }): Promise<boolean> => {
    console.log("Starting microphone recording with options:", options);
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (!electronAPI?.micRecording) {
      console.error("Microphone recording API not available");
      toast.error('Microphone recording is not available');
      return false;
    }
    
    try {
      console.log("Calling Electron API to start microphone recording");
      const result = await electronAPI.micRecording.startRecording(options);
      console.log("Start microphone recording result:", result);
      
      if (!result.success) {
        toast.error(`Failed to start recording: ${result.error || 'Unknown error'}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording');
      return false;
    }
  }, []);

  // Stop recording microphone
  const stopRecording = useCallback(async (): Promise<boolean> => {
    console.log("Stopping microphone recording");
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (!electronAPI?.micRecording) {
      console.error("Microphone recording API not available for stopping");
      return false;
    }
    
    try {
      const result = await electronAPI.micRecording.stopRecording();
      console.log("Stop microphone recording result:", result);
      return result.success;
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error('Failed to stop recording');
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