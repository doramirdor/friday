import PouchDB from 'pouchdb';
import leveldb from 'pouchdb-adapter-leveldb';
import path from 'path';
import { app } from 'electron';

// Register PouchDB adapters
PouchDB.plugin(leveldb);

// Store database instances
const databaseInstances = new Map();

// Get the app data path for PouchDB
const getAppDataPath = () => {
  return path.join(app.getPath('userData'), 'databases');
};

// Database configuration
const DB_NAME = 'friday-app';
const DB_OPTIONS = {
  auto_compaction: true,
  revs_limit: 50,
  adapter: 'leveldb',
  prefix: path.join(getAppDataPath(), '/'),
};

/**
 * Get or create a database instance
 */
const getDatabase = (name) => {
  const dbName = `${DB_NAME}-${name}`;
  if (!databaseInstances.has(dbName)) {
    const db = new PouchDB(dbName, {
      ...DB_OPTIONS,
      deterministic_revs: true
    });
    databaseInstances.set(dbName, db);
  }
  return databaseInstances.get(dbName);
};

/**
 * Set up database handlers
 */
export function setupDatabaseHandlers(ipcMain) {
  // Create/get database
  ipcMain.handle('db:create', async (event, { name, options }) => {
    try {
      const db = getDatabase(name);
      const info = await db.info();
      return { success: true, info };
    } catch (error) {
      console.error('Error creating database:', error);
      return { success: false, error: error.message };
    }
  });

  // Get document
  ipcMain.handle('db:get', async (event, { dbName, docId }) => {
    try {
      const db = getDatabase(dbName);
      const doc = await db.get(docId);
      return { success: true, doc };
    } catch (error) {
      console.error('Error getting document:', error);
      return { success: false, error: error.message };
    }
  });

  // Put document
  ipcMain.handle('db:put', async (event, { dbName, doc }) => {
    try {
      const db = getDatabase(dbName);
      const result = await db.put(doc);
      return { success: true, result };
    } catch (error) {
      console.error('Error putting document:', error);
      return { success: false, error: error.message };
    }
  });

  // Remove document
  ipcMain.handle('db:remove', async (event, { dbName, doc }) => {
    try {
      const db = getDatabase(dbName);
      const result = await db.remove(doc);
      return { success: true, result };
    } catch (error) {
      console.error('Error removing document:', error);
      return { success: false, error: error.message };
    }
  });

  // Query database
  ipcMain.handle('db:query', async (event, { dbName, options }) => {
    try {
      const db = getDatabase(dbName);
      const result = await db.find(options);
      return { success: true, result };
    } catch (error) {
      console.error('Error querying database:', error);
      return { success: false, error: error.message };
    }
  });

  // Get database info
  ipcMain.handle('db:info', async (event, { dbName }) => {
    try {
      const db = getDatabase(dbName);
      const info = await db.info();
      return { success: true, info };
    } catch (error) {
      console.error('Error getting database info:', error);
      return { success: false, error: error.message };
    }
  });
} 