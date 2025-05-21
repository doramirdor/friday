// An upgrade service to handle PouchDB version migrations and compatibility fixes
import { getPouchDB } from './pouchdb-setup';

/**
 * Check if PouchDB storage format needs to be upgraded
 * This handles cases where PouchDB schema/storage changes between versions
 * causing the "Class extends value [object Object] is not a constructor or null" error
 */
export const checkAndUpgradePouchDB = async (): Promise<void> => {
  try {
    // Try to clear any corrupted data in localStorage that could be causing issues
    const keys = Object.keys(localStorage);
    const pouchdbKeys = keys.filter(key => key.startsWith('_pouch_') || key.startsWith('friday-app-'));
    
    if (pouchdbKeys.length > 0) {
      console.log(`Found ${pouchdbKeys.length} PouchDB related localStorage items`);
      
      try {
        // Get the PouchDB constructor
        const PouchDB = await getPouchDB();
        
        // Attempt to access each database to check for corruption
        for (const key of pouchdbKeys) {
          const dbName = key.replace('_pouch_', '').replace('friday-app-', '');
          if (dbName) {
            const testDb = new PouchDB(`test-${dbName}-access`);
            // If we can create a test DB instance, the database should be ok
            await testDb.info();
            await testDb.destroy(); // Clean up test DB
          }
        }
      } catch (error) {
        console.error('Error accessing PouchDB, storage may be corrupted:', error);
        
        // If we got an initialization error, clear PouchDB data
        if (error instanceof Error && 
            (error.message.includes('constructor') || 
             error.message.includes('not a function'))) {
          
          console.warn('Detected PouchDB initialization issue - clearing localStorage data');
          
          // Clear PouchDB related localStorage entries to fix the issue
          for (const key of pouchdbKeys) {
            console.log(`Removing potentially corrupted PouchDB data: ${key}`);
            localStorage.removeItem(key);
          }
          
          // Reload the page to start fresh
          if (pouchdbKeys.length > 0) {
            console.log('PouchDB data cleared. Page will reload to reset storage.');
            
            // Optional: reload page after clearing storage
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error during PouchDB upgrade check:', err);
  }
};

export default checkAndUpgradePouchDB; 