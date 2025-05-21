// Import PouchDB as an ESM module
import PouchDBModule from 'pouchdb';
import PouchDBFindModule from 'pouchdb-find';

// Function to safely get PouchDB constructor
const getPouchDBConstructor = () => {
  try {
    // Handle different module formats (ESM/CommonJS)
    const PouchDBConstructor = 
      // @ts-ignore - Handle both module patterns
      (typeof PouchDBModule === 'function') ? PouchDBModule :
      // @ts-ignore - Handle default export
      (PouchDBModule.default && typeof PouchDBModule.default === 'function') ? PouchDBModule.default :
      // Fallback for object with constructor
      PouchDBModule;
    
    // Validate that we have a constructor
    if (typeof PouchDBConstructor !== 'function') {
      throw new Error('PouchDB is not a constructor: ' + (typeof PouchDBConstructor));
    }
    
    return PouchDBConstructor;
  } catch (error) {
    console.error('Error resolving PouchDB constructor:', error);
    throw error;
  }
};

// Get the PouchDB constructor
const PouchDB = getPouchDBConstructor();

// Similarly handle the find plugin
const PouchDBFind = 
  // @ts-ignore - Handle both module patterns
  (typeof PouchDBFindModule === 'function') ? PouchDBFindModule :
  // @ts-ignore - Handle default export
  (PouchDBFindModule.default && typeof PouchDBFindModule.default === 'function') ? PouchDBFindModule.default : 
  PouchDBFindModule;

// Register the PouchDB find plugin
PouchDB.plugin(PouchDBFind);

// Create DB namespace
const DB_NAME = 'friday-app';

// Export a factory function to create database instances
export const createDatabase = <T = any>(name: string) => {
  try {
    // @ts-ignore - Handle PouchDB typing for new instances
    return new PouchDB(`${DB_NAME}-${name}`);
  } catch (error) {
    console.error(`Error creating database ${name}:`, error);
    throw error;
  }
};

// Export the configured PouchDB class
export default PouchDB; 