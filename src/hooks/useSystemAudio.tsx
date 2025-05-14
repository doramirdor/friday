import { useState, useCallback } from 'react';

/**
 * Interface for the hook's return values
 */
interface UseSystemAudioReturn {
  isBlackHoleAvailable: boolean;
  getSystemAudioStream: (options?: MediaTrackConstraints) => Promise<MediaStream>;
}

/**
 * A hook for accessing system audio through BlackHole virtual audio device
 * 
 * @returns Functions and state for accessing system audio
 */
const useSystemAudio = (): UseSystemAudioReturn => {
  const [isBlackHoleAvailable, setIsBlackHoleAvailable] = useState<boolean>(false);

  /**
   * Gets a MediaStream with audio from the system (BlackHole) or falls back to microphone
   * 
   * @param options - Optional MediaTrackConstraints to apply
   * @returns A Promise resolving to a MediaStream
   */
  const getSystemAudioStream = useCallback(async (options: MediaTrackConstraints = {}): Promise<MediaStream> => {
    try {
      // Enumerate available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Look for BlackHole device
      const blackHoleDevice = devices.find(device => 
        device.kind === 'audioinput' && device.label.includes('BlackHole')
      );
      
      if (blackHoleDevice) {
        // BlackHole found, use it for system audio
        setIsBlackHoleAvailable(true);
        
        // Merge options with BlackHole device ID
        const audioConstraints = {
          ...options,
          deviceId: blackHoleDevice.deviceId
        };
        
        // Get the stream using BlackHole
        return await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints
        });
      } else {
        // No BlackHole found, fallback to default microphone
        setIsBlackHoleAvailable(false);
        console.warn("BlackHole audio device not found. Falling back to microphone.");
        
        // Get stream from microphone instead
        return await navigator.mediaDevices.getUserMedia({
          audio: options
        });
      }
    } catch (err) {
      console.error("Error accessing audio devices:", err);
      setIsBlackHoleAvailable(false);
      
      // Final fallback with minimal constraints
      return await navigator.mediaDevices.getUserMedia({
        audio: true
      });
    }
  }, []);

  return {
    isBlackHoleAvailable,
    getSystemAudioStream
  };
};

export default useSystemAudio; 