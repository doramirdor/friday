// PouchDB setup that uses global/window PouchDB to avoid module loading issues
// This approach bypasses the ESM/CommonJS compatibility problems
import PouchDB from 'pouchdb';

// Types for TypeScript only (not for runtime imports)
type PouchDBType = any;
type PouchDBOptions = any;

// DB namespace and configuration
const DB_NAME = 'friday-app';

// Types for TypeScript
interface DatabaseResponse<T> {
  success: boolean;
  error?: string;
  result?: T;
  info?: any;
  doc?: T;
}

/**
 * Get database options based on environment
 */
const getDBOptions = () => {
  // Check if we're running in Electron
  const isElectron = !!(window as any).electronAPI?.isElectron;
  const dbPath = (window as any).dbPath;

  if (isElectron && dbPath) {
    // In Electron, use leveldb adapter with app data path
    return {
      auto_compaction: true,
      revs_limit: 50,
      adapter: 'leveldb',
      prefix: dbPath + '/',
    };
  } else {
    // In web browser, use IndexedDB
    return {
      auto_compaction: true,
      revs_limit: 50,
      adapter: 'idb',
    };
  }
};

// Store database instances
const databaseInstances: { [key: string]: any } = {};

/**
 * Get PouchDB instance with correct adapter
 */
const getPouchDBInstance = (): typeof PouchDB => {
  // Check if we're running in Electron
  const isElectron = !!(window as any).electronAPI?.isElectron;

  if (isElectron) {
    // In Electron environment, use the exposed PouchDB
    const ElectronPouchDB = (window as any).PouchDB;
    if (ElectronPouchDB && typeof ElectronPouchDB === 'function') {
      return ElectronPouchDB;
    }
  }

  // Fallback to imported PouchDB
  return PouchDB;
};

/**
 * Create a database instance with persistence
 */
export const createDatabase = async <T = any>(name: string): Promise<any> => {
  try {
    // Check if we're running in Electron
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.isElectron) {
      throw new Error('This application requires Electron to run');
    }

    // Create database through IPC
    const response = await electronAPI.database.create(name, {});
    if (!response.success) {
      throw new Error(response.error);
    }

    // Return a proxy object that implements the database interface
    return {
      async get(id: string): Promise<T> {
        const response: DatabaseResponse<T> = await electronAPI.database.get(name, id);
        if (!response.success) throw new Error(response.error);
        return response.doc!;
      },

      async put(doc: T): Promise<any> {
        const response: DatabaseResponse<any> = await electronAPI.database.put(name, doc);
        if (!response.success) throw new Error(response.error);
        return response.result;
      },

      async remove(doc: T): Promise<any> {
        const response: DatabaseResponse<any> = await electronAPI.database.remove(name, doc);
        if (!response.success) throw new Error(response.error);
        return response.result;
      },

      async find(options: any): Promise<any> {
        const response: DatabaseResponse<any> = await electronAPI.database.query(name, options);
        if (!response.success) throw new Error(response.error);
        return response.result;
      },

      async info(): Promise<any> {
        const response: DatabaseResponse<any> = await electronAPI.database.info(name);
        if (!response.success) throw new Error(response.error);
        return response.info;
      }
    };
  } catch (error) {
    console.error(`❌ Error creating database ${name}:`, error);
    throw error;
  }
};

/**
 * Get the PouchDB constructor
 */
export const getPouchDB = (): any => {
  return getPouchDBInstance();
};

/**
 * Default export is a dummy function since we don't need direct PouchDB access anymore
 */
export default () => {
  throw new Error('Direct PouchDB access is not supported. Use createDatabase() instead.');
}; 