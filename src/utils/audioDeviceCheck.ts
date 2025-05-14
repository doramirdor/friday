/**
 * Checks if the BlackHole audio device is available
 * 
 * @returns A promise that resolves to an object with availability and message
 */
export async function checkBlackHoleAvailability(): Promise<{ 
  available: boolean; 
  message: string;
}> {
  try {
    // First check if we have permission to enumerate devices
    await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Then enumerate the devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Look for BlackHole among audio input devices
    const blackHoleDevice = devices.find(device => 
      device.kind === 'audioinput' && device.label.includes('BlackHole')
    );
    
    if (blackHoleDevice) {
      return { 
        available: true, 
        message: `BlackHole found: ${blackHoleDevice.label}` 
      };
    } else {
      return { 
        available: false, 
        message: "BlackHole not detected. Please install BlackHole for system audio recording." 
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
 * Tests recording from BlackHole device
 * 
 * @returns A promise that resolves to a result object
 */
export async function testBlackHoleRecording(): Promise<{
  success: boolean;
  message: string;
  stream?: MediaStream;
}> {
  try {
    // First enumerate the devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Look for BlackHole device
    const blackHoleDevice = devices.find(device => 
      device.kind === 'audioinput' && device.label.includes('BlackHole')
    );
    
    if (!blackHoleDevice) {
      return {
        success: false,
        message: "BlackHole device not found"
      };
    }
    
    // Try to get a stream from BlackHole
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: blackHoleDevice.deviceId }
    });
    
    // Check if we got a valid stream with active tracks
    if (stream && stream.getAudioTracks().length > 0) {
      return {
        success: true,
        message: "Successfully connected to BlackHole audio device",
        stream
      };
    } else {
      return {
        success: false,
        message: "Connected to BlackHole but no audio tracks available"
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `Error testing BlackHole: ${err instanceof Error ? err.message : String(err)}`
    };
  }
} 