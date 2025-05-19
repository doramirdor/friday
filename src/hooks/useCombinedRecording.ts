import { useState, useEffect, useRef } from 'react';

interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    systemAudio?: any;
    micRecording?: any;
    combinedRecording?: {
      startRecording: (options?: { filepath?: string; filename?: string }) => Promise<{ success: boolean }>;
      stopRecording: () => Promise<{ success: boolean }>;
      onStatusUpdate: (callback: (status: string, timestamp: number, filepath: string) => void) => void;
      onError: (callback: (errorCode: string) => void) => void;
    };
  }
}

interface CombinedRecordingHook {
  isAvailable: boolean;
  isRecording: boolean;
  recordingPath: string | null;
  recordingDuration: number;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
}

export default function useCombinedRecording(): CombinedRecordingHook {
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const durationTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Check if the API is available
  useEffect(() => {
    const win = window as unknown as ElectronWindow;
    const available = !!(win.electronAPI?.isElectron && win.electronAPI?.combinedRecording);
    setIsAvailable(available);
    
    if (available) {
      // Set up the status update listener
      win.electronAPI?.combinedRecording?.onStatusUpdate((status, timestamp, filepath) => {
        if (status === 'started') {
          setIsRecording(true);
          setRecordingPath(null);
          startTimeRef.current = Date.now();
          
          // Start duration timer
          if (durationTimerRef.current === null) {
            durationTimerRef.current = window.setInterval(() => {
              setRecordingDuration((Date.now() - startTimeRef.current) / 1000);
            }, 1000);
          }
        } else if (status === 'stopped') {
          setIsRecording(false);
          setRecordingPath(filepath);
          
          // Stop duration timer
          if (durationTimerRef.current !== null) {
            clearInterval(durationTimerRef.current);
            durationTimerRef.current = null;
          }
        }
      });
      
      // Set up error listener
      win.electronAPI?.combinedRecording?.onError((errorCode) => {
        console.error(`Combined recording error: ${errorCode}`);
        setIsRecording(false);
        
        // Stop duration timer
        if (durationTimerRef.current !== null) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }
      });
    }
    
    // Cleanup on unmount
    return () => {
      if (durationTimerRef.current !== null) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, []);
  
  // Start recording function
  const startRecording = async (): Promise<boolean> => {
    try {
      const win = window as unknown as ElectronWindow;
      
      if (!isAvailable) {
        console.error('Combined recording API is not available');
        return false;
      }
      
      const result = await win.electronAPI?.combinedRecording?.startRecording();
      
      if (result?.success) {
        setRecordingDuration(0);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error starting combined recording:', error);
      return false;
    }
  };
  
  // Stop recording function
  const stopRecording = async (): Promise<boolean> => {
    try {
      const win = window as unknown as ElectronWindow;
      
      if (!isAvailable) {
        console.error('Combined recording API is not available');
        return false;
      }
      
      const result = await win.electronAPI?.combinedRecording?.stopRecording();
      return !!result?.success;
    } catch (error) {
      console.error('Error stopping combined recording:', error);
      return false;
    }
  };
  
  return {
    isAvailable,
    isRecording,
    recordingPath,
    recordingDuration,
    startRecording,
    stopRecording
  };
} 