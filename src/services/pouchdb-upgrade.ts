// An upgrade service to handle PouchDB version migrations and compatibility fixes
import { getPouchDB } from './pouchdb-setup';

// Current schema version - increment this when making breaking changes
const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * Check if PouchDB storage format needs to be upgraded
 * This handles cases where PouchDB schema/storage changes between versions
 */
export const checkAndUpgradePouchDB = async (): Promise<void> => {
  try {
    const currentVersion = localStorage.getItem('pouchdb_version');
    
    // Only clear data if version mismatch or no version found
    if (!currentVersion || currentVersion !== CURRENT_SCHEMA_VERSION) {
      console.log('PouchDB version mismatch detected, performing upgrade...');
      console.log(`Current version: ${currentVersion}, Required version: ${CURRENT_SCHEMA_VERSION}`);
      
      const keys = Object.keys(localStorage);
      const pouchdbKeys = keys.filter(key => key.startsWith('_pouch_') || key.startsWith('friday-app-'));
      
      if (pouchdbKeys.length > 0) {
        console.log(`Found ${pouchdbKeys.length} PouchDB related localStorage items`);
        
        // Clear all PouchDB data to ensure clean state
        for (const key of pouchdbKeys) {
          console.log(`Removing PouchDB data: ${key}`);
          localStorage.removeItem(key);
        }
      }
      
      // Set new version
      localStorage.setItem('pouchdb_version', CURRENT_SCHEMA_VERSION);
      console.log('PouchDB upgrade completed successfully');
    } else {
      console.log('PouchDB version check passed, no upgrade needed');
    }
  } catch (err) {
    console.error('Error during PouchDB upgrade check:', err);
  }
};

export default checkAndUpgradePouchDB; 