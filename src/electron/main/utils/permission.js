import { systemPreferences } from 'electron';

// Check if we have permission to record system audio
export async function checkPermissions() {
  // macOS requires screen capture permission to record system audio
  if (process.platform === 'darwin') {
    return systemPreferences.getMediaAccessStatus('screen') === 'granted';
  }
  
  // On other platforms, we don't need special permissions
  return true;
} 