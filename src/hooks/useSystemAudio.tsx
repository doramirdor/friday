import { useState, useCallback } from 'react';

/**
 * Interface for the hook's return values
 */
interface UseSystemAudioReturn {
  isVirtualAudioAvailable: boolean;
  getSystemAudioStream: (options?: MediaTrackConstraints) => Promise<MediaStream>;
}

/**
 * A hook for accessing system audio through virtual audio device
 * 
 * @returns Functions and state for accessing system audio
 */
const useSystemAudio = (): UseSystemAudioReturn => {
  const [isVirtualAudioAvailable, setIsVirtualAudioAvailable] = useState<boolean>(false);

  /**
   * Gets a MediaStream with audio from the system (virtual device) or falls back to microphone
   * 
   * @param options - Optional MediaTrackConstraints to apply
   * @returns A Promise resolving to a MediaStream
   */
  const getSystemAudioStream = useCallback(async (options: MediaTrackConstraints = {}): Promise<MediaStream> => {
    try {
      // Enumerate available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Look for virtual audio device - common ones include: VB-Cable, BlackHole, Soundflower, etc.
      const virtualAudioDevice = devices.find(device => 
        device.kind === 'audioinput' && 
        (device.label.includes('Virtual') || 
         device.label.includes('VB-Cable') || 
         device.label.includes('BlackHole') ||
         device.label.includes('Soundflower') ||
         device.label.includes('CABLE'))
      );
      
      if (virtualAudioDevice) {
        // Virtual audio device found, use it for system audio
        setIsVirtualAudioAvailable(true);
        
        // Merge options with virtual device ID
        const audioConstraints = {
          ...options,
          deviceId: virtualAudioDevice.deviceId
        };
        
        // Get the stream using virtual audio device
        return await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints
        });
      } else {
        // No virtual audio device found, fallback to default microphone
        setIsVirtualAudioAvailable(false);
        console.warn("Virtual audio device not found. Falling back to microphone.");
        
        // Get stream from microphone instead
        return await navigator.mediaDevices.getUserMedia({
          audio: options
        });
      }
    } catch (err) {
      console.error("Error accessing audio devices:", err);
      setIsVirtualAudioAvailable(false);
      
      // Final fallback with minimal constraints
      return await navigator.mediaDevices.getUserMedia({
        audio: true
      });
    }
  }, []);

  return {
    isVirtualAudioAvailable: isVirtualAudioAvailable,
    getSystemAudioStream
  };
};

export default useSystemAudio; 