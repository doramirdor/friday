import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

// Define the window interface with our Electron API
interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    systemAudio: {
      checkPermissions: () => Promise<{ granted: boolean }>;
      startRecording: (options?: { filepath?: string; filename?: string }) => Promise<{ 
        success: boolean; 
        filepath?: string; 
        filename?: string;
        error?: string;
      }>;
      stopRecording: () => Promise<{ success: boolean; error?: string }>;
      onStatusUpdate: (callback: (status: string, timestamp: number, filepath: string) => void) => void;
      onError: (callback: (errorCode: string) => void) => void;
      selectFolder: () => void;
      onFolderSelected: (callback: (path: string) => void) => void;
    };
  };
}

// Hook return type
interface UseSystemAudioRecordingReturn {
  isAvailable: boolean;
  isRecording: boolean;
  hasPermission: boolean;
  recordingPath: string | null;
  recordingDuration: number;
  checkPermissions: () => Promise<boolean>;
  startRecording: (options?: { filepath?: string; filename?: string }) => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
  selectSaveFolder: () => Promise<string | null>;
}

/**
 * A hook for using native macOS system audio recording
 */
export default function useSystemAudioRecording(): UseSystemAudioRecordingReturn {
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);

  // Check if the system audio API is available (Electron + macOS)
  useEffect(() => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    const isAvailable = !!(
      electronAPI?.isElectron && 
      electronAPI.platform === 'darwin' && 
      electronAPI.systemAudio
    );
    setIsAvailable(isAvailable);

    // If available, check permissions immediately
    if (isAvailable) {
      checkPermissions();
    }
  }, []);

  // Set up event listeners for recording status
  useEffect(() => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (electronAPI?.systemAudio) {
      // Listen for recording status updates
      electronAPI.systemAudio.onStatusUpdate((status, timestamp, filepath) => {
        if (status === 'START_RECORDING') {
          setIsRecording(true);
          setRecordingPath(filepath);
          setRecordingStartTime(timestamp);
          toast.success('System audio recording started');
        } else if (status === 'STOP_RECORDING') {
          setIsRecording(false);
          setRecordingStartTime(null);
          toast.success('Recording saved to: ' + filepath);
        }
      });

      // Listen for recording errors
      electronAPI.systemAudio.onError((errorCode) => {
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

  // Check if we have permission to record system audio
  const checkPermissions = useCallback(async (): Promise<boolean> => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (!electronAPI?.systemAudio) return false;
    
    try {
      const { granted } = await electronAPI.systemAudio.checkPermissions();
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error('Error checking permissions:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  // Start recording system audio
  const startRecording = useCallback(async (options?: { filepath?: string; filename?: string }): Promise<boolean> => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (!electronAPI?.systemAudio) {
      toast.error('System audio recording is not available');
      return false;
    }
    
    try {
      // Check permissions first
      const hasPermission = await checkPermissions();
      if (!hasPermission) {
        toast.error('Permission to record system audio was denied');
        return false;
      }

      const result = await electronAPI.systemAudio.startRecording(options);
      
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
  }, [checkPermissions]);

  // Stop recording system audio
  const stopRecording = useCallback(async (): Promise<boolean> => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI;
    if (!electronAPI?.systemAudio) return false;
    
    try {
      const result = await electronAPI.systemAudio.stopRecording();
      return result.success;
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error('Failed to stop recording');
      return false;
    }
  }, []);

  // Select a folder to save recordings
  const selectSaveFolder = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const electronAPI = (window as unknown as ElectronWindow).electronAPI;
      if (!electronAPI?.systemAudio) {
        resolve(null);
        return;
      }

      electronAPI.systemAudio.onFolderSelected((path) => {
        resolve(path);
      });

      electronAPI.systemAudio.selectFolder();
    });
  }, []);

  return {
    isAvailable,
    isRecording,
    hasPermission,
    recordingPath,
    recordingDuration,
    checkPermissions,
    startRecording,
    stopRecording,
    selectSaveFolder,
  };
} 