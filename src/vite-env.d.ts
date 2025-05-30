/// <reference types="vite/client" />

// Define a unified ElectronAPI interface for all components to use
interface ElectronAPI {
  isElectron?: boolean;
  platform?: string;
  sendMessage?: (channel: string, data: unknown) => void;
  receive?: (channel: string, callback: (...args: unknown[]) => void) => void;
  invokeGoogleSpeech?: (audioBuffer: ArrayBuffer) => Promise<string>;
  saveAudioFile?: (buffer: ArrayBuffer, filename: string, formats: string[]) => Promise<{
    success: boolean;
    files?: Array<{ format: string; path: string }>;
    error?: string;
  }>;
  writeTemporaryFile?: (buffer: ArrayBuffer, filename: string) => Promise<{
    success: boolean;
    filePath?: string;
    size?: number;
    error?: string;
  }>;
  deleteFile?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  readAudioFile?: (filePath: string) => Promise<{
    success?: boolean;
    buffer?: ArrayBuffer;
    error?: string;
  }>;
}

// Extend Window interface to include our ElectronAPI
interface Window {
  electronAPI?: ElectronAPI;
}

