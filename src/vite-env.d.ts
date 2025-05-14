
/// <reference types="vite/client" />

// Define a unified ElectronAPI interface for all components to use
interface ElectronAPI {
  isElectron?: boolean;
  platform?: string;
  sendMessage?: (channel: string, data: unknown) => void;
  receive?: (channel: string, callback: (...args: unknown[]) => void) => void;
  invokeGoogleSpeech?: (audioBuffer: ArrayBuffer) => Promise<string>;
}

// Extend Window interface to include our ElectronAPI
interface Window {
  electronAPI?: ElectronAPI;
}

