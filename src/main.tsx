import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Define the ElectronAPI interface
interface ElectronWindow extends Window {
  electronAPI?: {
    isElectron: boolean;
    platform: string;
    sendMessage: (channel: string, data: unknown) => void;
    receive: (channel: string, callback: (...args: unknown[]) => void) => void;
  }
}

// Check if we're running in Electron using the electronAPI exposed by preload
const isElectron = !!(window as ElectronWindow).electronAPI?.isElectron || 
  window.navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

// Pass the environment information to the app
createRoot(document.getElementById("root")!).render(<App isElectron={isElectron} />);
