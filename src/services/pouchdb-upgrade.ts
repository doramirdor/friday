// An upgrade service to handle database version migrations and compatibility fixes

// Current schema version - increment this when making breaking changes
const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * Check if database storage format needs to be upgraded
 * This handles cases where database schema/storage changes between versions
 */
export const checkAndUpgradePouchDB = async (): Promise<void> => {
  try {
    const currentVersion = localStorage.getItem('database_version');
    
    // Only clear data if version mismatch or no version found
    if (!currentVersion || currentVersion !== CURRENT_SCHEMA_VERSION) {
      console.log('Database version mismatch detected, performing upgrade...');
      console.log(`Current version: ${currentVersion}, Required version: ${CURRENT_SCHEMA_VERSION}`);
      
      const keys = Object.keys(localStorage);
      const dbKeys = keys.filter(key => key.startsWith('_pouch_') || key.startsWith('friday-app-'));
      
      if (dbKeys.length > 0) {
        console.log(`Found ${dbKeys.length} database related localStorage items`);
        
        // Clear all database data to ensure clean state
        for (const key of dbKeys) {
          console.log(`Removing database data: ${key}`);
          localStorage.removeItem(key);
        }
      }
      
      // Set new version
      localStorage.setItem('database_version', CURRENT_SCHEMA_VERSION);
      console.log('Database upgrade completed successfully');
    } else {
      console.log('Database version check passed, no upgrade needed');
    }
  } catch (err) {
    console.error('Error during database upgrade check:', err);
  }
};

export default checkAndUpgradePouchDB; 