import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Add global error handler for unhandled errors
window.addEventListener('error', (event) => {
  console.error('Unhandled global error:', event.error);
  
  // Check if it's a database-related error
  if (event.error?.toString().includes('database') || 
      event.error?.message?.includes('Class extends value') ||
      event.error?.message?.includes('not a constructor')) {
        
    console.error('Database error detected - attempting recovery');
    
    // Clear database related localStorage data
    const keys = Object.keys(localStorage);
    const dbKeys = keys.filter(key => 
      key.startsWith('_pouch_') || key.startsWith('friday-app-')
    );
    
    if (dbKeys.length > 0) {
      console.log(`Clearing ${dbKeys.length} database storage items to recover from error`);
      for (const key of dbKeys) {
        console.log(`Removing: ${key}`);
        localStorage.removeItem(key);
      }
    }
    
    // Add a UI element to inform user and offer reload
    document.body.innerHTML += `
      <div style="position:fixed; top:0; left:0; right:0; background:#ff4444; color:white; padding:15px; z-index:9999; text-align:center; font-weight:bold;">
        Database error detected. <button style="background:white; color:#ff4444; border:none; padding:5px 10px; margin-left:10px; cursor:pointer; border-radius:4px;" onclick="window.location.reload()">Reload Application</button>
      </div>
    `;
  }
});

// Check if we're running in Electron using the electronAPI exposed by preload
const isElectron = !!window.electronAPI?.isElectron || 
  window.navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

// Pass the environment information to the app
createRoot(document.getElementById("root")!).render(<App isElectron={isElectron} />);
