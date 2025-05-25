import PouchDB from 'pouchdb';
import leveldb from 'pouchdb-adapter-leveldb';
import find from 'pouchdb-find';
import path from 'path';
import { app } from 'electron';

// Register PouchDB adapters and plugins
PouchDB.plugin(leveldb);
PouchDB.plugin(find);

// Store database instances
const databaseInstances = new Map();

// Get the app data path for PouchDB
const getAppDataPath = () => {
  return path.join(app.getPath('userData'), 'databases');
};

// Database configuration
const DB_NAME_PREFIX = 'friday-app';
const DB_OPTIONS = {
  auto_compaction: true,
  revs_limit: 50,
  adapter: 'leveldb',
  prefix: path.join(getAppDataPath(), '/'),
};

/**
 * Get or create a database instance
 * The 'name' parameter is the suffix for the database name (e.g., 'user-settings')
 */
const getDatabase = async (nameSuffix) => {
  const dbName = `${DB_NAME_PREFIX}-${nameSuffix}`;
  if (!databaseInstances.has(dbName)) {
    console.log(`Creating new PouchDB instance: ${dbName} with options:`, DB_OPTIONS);
    const db = new PouchDB(dbName, {
      ...DB_OPTIONS,
      deterministic_revs: true
    });
    // It's good practice to wait for the database to be ready, e.g., by calling info()
    await db.info(); 
    databaseInstances.set(dbName, db);
    console.log(`Database ${dbName} created and info confirmed.`);
  }
  return databaseInstances.get(dbName);
};

/**
 * Set up database handlers
 */
export function setupDatabaseHandlers(ipcMain) {
  // Create/get database. The 'name' received is the suffix.
  ipcMain.handle('db:create', async (event, { name, options }) => {
    try {
      const db = await getDatabase(name);
      const info = await db.info();
      console.log(`db:create successful for ${name}. Info:`, info);
      return { success: true, info };
    } catch (error) {
      console.error(`Error in db:create for '${name}':`, error);
      return { success: false, error: error.message || 'Unknown error during db:create' };
    }
  });

  // Get document. 'dbName' received is the suffix.
  ipcMain.handle('db:get', async (event, { dbName, docId }) => {
    try {
      const db = await getDatabase(dbName);
      const doc = await db.get(docId);
      return { success: true, doc };
    } catch (error) {
      console.error(`Error in db:get for '${dbName}', docId '${docId}':`, error);
      return { success: false, error: error.message };
    }
  });

  // Put document. 'dbName' received is the suffix.
  ipcMain.handle('db:put', async (event, { dbName, doc }) => {
    try {
      const db = await getDatabase(dbName);
      const result = await db.put(doc);
      return { success: true, result };
    } catch (error) {
      console.error(`Error in db:put for '${dbName}':`, error);
      return { success: false, error: error.message };
    }
  });

  // Remove document. 'dbName' received is the suffix.
  ipcMain.handle('db:remove', async (event, { dbName, doc }) => {
    try {
      const db = await getDatabase(dbName);
      const result = await db.remove(doc);
      return { success: true, result };
    } catch (error) {
      console.error(`Error in db:remove for '${dbName}':`, error);
      return { success: false, error: error.message };
    }
  });

  // Query database. 'dbName' received is the suffix.
  ipcMain.handle('db:query', async (event, { dbName, options }) => {
    try {
      const db = await getDatabase(dbName);
      // Ensure indexes are created before querying, if necessary for the options.
      // Example: await db.createIndex({ index: { fields: ['someField'] } });
      const result = await db.find(options);
      return { success: true, result };
    } catch (error) {
      console.error(`Error in db:query for '${dbName}' with options:`, options, error);
      return { success: false, error: error.message };
    }
  });

  // Get database info. 'dbName' received is the suffix.
  ipcMain.handle('db:info', async (event, { dbName }) => {
    try {
      const db = await getDatabase(dbName);
      const info = await db.info();
      return { success: true, info };
    } catch (error) {
      console.error(`Error in db:info for '${dbName}':`, error);
      return { success: false, error: error.message };
    }
  });

  // Create index. 'dbName' received is the suffix.
  ipcMain.handle('db:createIndex', async (event, { dbName, indexOptions }) => {
    try {
      const db = await getDatabase(dbName);
      const result = await db.createIndex(indexOptions);
      console.log(`Index created for '${dbName}':`, result);
      return { success: true, result };
    } catch (error) {
      console.error(`Error in db:createIndex for '${dbName}' with options:`, indexOptions, error);
      return { success: false, error: error.message };
    }
  });

  // Get indexes. 'dbName' received is the suffix.
  ipcMain.handle('db:getIndexes', async (event, { dbName }) => {
    try {
      const db = await getDatabase(dbName);
      const result = await db.getIndexes();
      return { success: true, result };
    } catch (error) {
      console.error(`Error in db:getIndexes for '${dbName}':`, error);
      return { success: false, error: error.message };
    }
  });
} 