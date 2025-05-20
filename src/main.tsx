import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Add global error handler for unhandled errors
window.addEventListener('error', (event) => {
  console.error('Unhandled global error:', event.error);
  
  // Check if it's a PouchDB error
  if (event.error?.toString().includes('PouchDB') || 
      event.error?.message?.includes('Class extends value')) {
    console.error('PouchDB error detected - consider clearing localStorage and reloading');
    
    // You could add some UI here to inform the user
    document.body.innerHTML += `
      <div style="position:fixed; top:0; left:0; right:0; background:red; color:white; padding:10px; z-index:9999">
        Database error detected. <button onclick="localStorage.clear(); window.location.reload()">Clear Data & Reload</button>
      </div>
    `;
  }
});

// Check if we're running in Electron using the electronAPI exposed by preload
const isElectron = !!window.electronAPI?.isElectron || 
  window.navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

// Pass the environment information to the app
createRoot(document.getElementById("root")!).render(<App isElectron={isElectron} />);
