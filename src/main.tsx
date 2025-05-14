
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Check if we're running in Electron
const isElectron = window.navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

// Pass the environment information to the app
createRoot(document.getElementById("root")!).render(<App isElectron={isElectron} />);
