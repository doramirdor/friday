// PouchDB setup that uses global/window PouchDB to avoid module loading issues
// This approach bypasses the ESM/CommonJS compatibility problems

// Types for TypeScript only (not for runtime imports)
type PouchDBType = any;
type PouchDBOptions = any;

// DB namespace
const DB_NAME = 'friday-app';

/**
 * Get PouchDB from the global/window object
 * This bypasses ESM/CommonJS module issues
 */
const getGlobalPouchDB = (): any => {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // Use direct global PouchDB (fixed by our patch script) or fallback
    const pouchdb = (window as any).PouchDB || (window as any).PouchDBFallback;
    
    if (pouchdb) {
      console.log('✅ Using global PouchDB');
      return pouchdb;
    }
    
    console.error('❌ Global PouchDB not found!');
  }
  
  // For Node/SSR, try a direct require
  try {
    // Use Function constructor to avoid static analysis by bundlers
    // This trick prevents the bundler from trying to bundle it
    const dynamicRequire = new Function('modulePath', 'return require(modulePath)');
    return dynamicRequire('pouchdb');
  } catch (error) {
    console.error('❌ Failed to load PouchDB in non-browser environment', error);
  }
  
  throw new Error('PouchDB not available in this environment');
};

/**
 * Create a database instance
 */
export const createDatabase = async <T = any>(name: string): Promise<any> => {
  try {
    // Get the PouchDB constructor from the global object
    const PouchDB = getGlobalPouchDB();
    
    if (typeof PouchDB !== 'function') {
      console.error('❌ PouchDB is not a constructor!', typeof PouchDB);
      throw new Error(`PouchDB is not a constructor: ${typeof PouchDB}`);
    }
    
    // Create a new database instance
    const dbName = `${DB_NAME}-${name}`;
    console.log(`🔄 Creating database: ${dbName}`);
    const db = new PouchDB(dbName);
    
    // Add the find plugin if it's not already included
    if (PouchDB.plugin && !db.find) {
      try {
        // Try to load the find plugin directly from window
        const PouchDBFind = (window as any).PouchDBFind;
        if (PouchDBFind) {
          PouchDB.plugin(PouchDBFind);
        } else {
          // For environments without the global plugin
          const dynamicRequire = new Function('modulePath', 'return require(modulePath)');
          const findPlugin = dynamicRequire('pouchdb-find');
          PouchDB.plugin(findPlugin);
        }
      } catch (e) {
        console.warn('⚠️ Could not load PouchDB find plugin', e);
      }
    }
    
    return db;
  } catch (error) {
    console.error(`❌ Error creating database ${name}:`, error);
    throw error;
  }
};

/**
 * Get the PouchDB constructor
 */
export const getPouchDB = (): any => {
  return getGlobalPouchDB();
};

/**
 * Default export is the PouchDB constructor
 */
export default getGlobalPouchDB; 