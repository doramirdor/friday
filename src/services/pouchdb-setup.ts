// Dynamic PouchDB loader that handles both ESM and CommonJS environments

// Define types only (not importing the actual modules here)
type PouchDBType = any;  // Simplify for now to avoid dependency issues
type PouchDBFindType = any;

let PouchDB: PouchDBType | null = null;
let initialized = false;

// DB namespace
const DB_NAME = 'friday-app';

// This function ensures PouchDB is loaded correctly before use
const ensurePouchDBLoaded = async (): Promise<PouchDBType> => {
  if (initialized && PouchDB) {
    return PouchDB;
  }
  
  try {
    console.log('🔄 Initializing PouchDB dynamically...');
    
    // Dynamic imports to ensure proper module loading in different environments
    const PouchDBModule = await import('pouchdb');
    const PouchDBFindModule = await import('pouchdb-find');
    
    // Get the actual constructor (handle both ESM and CommonJS)
    const PouchDBConstructor = PouchDBModule.default || PouchDBModule;
    const PouchDBFindPlugin = PouchDBFindModule.default || PouchDBFindModule;
    
    // Validate that we have a constructor
    if (typeof PouchDBConstructor !== 'function') {
      throw new Error('PouchDB is not a function: ' + typeof PouchDBConstructor);
    }
    
    // Register the find plugin
    PouchDBConstructor.plugin(PouchDBFindPlugin);
    
    // Store the constructor
    PouchDB = PouchDBConstructor;
    initialized = true;
    
    console.log('✅ PouchDB initialized successfully');
    return PouchDB;
  } catch (error) {
    console.error('❌ PouchDB initialization error:', error);
    throw error;
  }
};

// Export a factory function to create database instances
export const createDatabase = async <T = any>(name: string) => {
  try {
    const PouchDBInstance = await ensurePouchDBLoaded();
    // @ts-ignore - Handle PouchDB dynamic typing with generics
    return new PouchDBInstance(`${DB_NAME}-${name}`);
  } catch (error) {
    console.error(`Error creating database ${name}:`, error);
    throw error;
  }
};

// Export a function to get the PouchDB constructor
export const getPouchDB = async () => {
  return await ensurePouchDBLoaded();
};

// Export default as a function that returns a promise with PouchDB
export default async () => {
  return await ensurePouchDBLoaded();
}; 