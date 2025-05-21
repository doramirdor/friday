/**
 * Checks if a virtual audio device is available
 * 
 * @returns A promise that resolves to an object with availability and message
 */
export async function checkVirtualAudioAvailability(): Promise<{ 
  available: boolean; 
  message: string;
}> {
  try {
    // First check if we have permission to enumerate devices
    await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Then enumerate the devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Look for virtual audio devices among audio input devices
    const virtualAudioDevice = devices.find(device => 
      device.kind === 'audioinput' && 
      (device.label.includes('Virtual') || 
       device.label.includes('VB-Cable') || 
       device.label.includes('BlackHole') ||
       device.label.includes('Soundflower') ||
       device.label.includes('CABLE'))
    );
    
    if (virtualAudioDevice) {
      return { 
        available: true, 
        message: `Virtual audio device found: ${virtualAudioDevice.label}` 
      };
    } else {
      return { 
        available: false, 
        message: "No virtual audio device detected. Please install a virtual audio device for system audio recording." 
      };
    }
  } catch (err) {
    console.error("Error checking audio devices:", err);
    return { 
      available: false, 
      message: `Error accessing audio devices: ${err instanceof Error ? err.message : String(err)}` 
    };
  }
}

/**
 * Checks if the user has granted microphone permissions
 * 
 * @returns A promise that resolves to an object with status and message
 */
export async function checkMicrophonePermission(): Promise<{
  granted: boolean;
  message: string;
}> {
  try {
    // Request microphone access
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return { 
      granted: true, 
      message: "Microphone permission granted" 
    };
  } catch (err) {
    return { 
      granted: false, 
      message: `Microphone permission denied: ${err instanceof Error ? err.message : String(err)}` 
    };
  }
}

/**
 * Tests recording from a virtual audio device
 * 
 * @returns A promise that resolves to a result object
 */
export async function testVirtualAudioRecording(): Promise<{
  success: boolean;
  message: string;
  stream?: MediaStream;
}> {
  try {
    // First enumerate the devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Look for virtual audio device
    const virtualAudioDevice = devices.find(device => 
      device.kind === 'audioinput' && 
      (device.label.includes('Virtual') || 
       device.label.includes('VB-Cable') || 
       device.label.includes('BlackHole') ||
       device.label.includes('Soundflower') ||
       device.label.includes('CABLE'))
    );
    
    if (!virtualAudioDevice) {
      return {
        success: false,
        message: "Virtual audio device not found"
      };
    }
    
    // Try to get a stream from the virtual audio device
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: virtualAudioDevice.deviceId }
    });
    
    // Check if we got a valid stream with active tracks
    if (stream && stream.getAudioTracks().length > 0) {
      return {
        success: true,
        message: "Successfully connected to virtual audio device",
        stream
      };
    } else {
      return {
        success: false,
        message: "Connected to virtual audio device but no audio tracks available"
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `Error testing virtual audio device: ${err instanceof Error ? err.message : String(err)}`
    };
  }
} 