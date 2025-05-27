import PouchDB from 'pouchdb';
import leveldb from 'pouchdb-adapter-leveldb';
import find from 'pouchdb-find';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

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
 * Clean up stale lock files that might be left from previous crashes
 */
const cleanupStaleLocks = async (dbPath) => {
  try {
    const lockFile = path.join(dbPath, 'LOCK');
    if (fs.existsSync(lockFile)) {
      console.log(`Found stale lock file: ${lockFile}, attempting to remove...`);
      fs.unlinkSync(lockFile);
      console.log(`Successfully removed stale lock file: ${lockFile}`);
    }
  } catch (error) {
    console.warn(`Could not remove lock file: ${error.message}`);
  }
};

/**
 * Get or create a database instance with lock handling
 * The 'name' parameter is the suffix for the database name (e.g., 'user-settings')
 */
const getDatabase = async (nameSuffix, retryCount = 3) => {
  const dbName = `${DB_NAME_PREFIX}-${nameSuffix}`;
  
  if (databaseInstances.has(dbName)) {
    return databaseInstances.get(dbName);
  }

  let lastError;
  
  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      console.log(`Creating new PouchDB instance: ${dbName} (attempt ${attempt + 1}/${retryCount})`);
      
      // If this is a retry, try to clean up stale locks
      if (attempt > 0) {
        const dbPath = path.join(getAppDataPath(), dbName);
        await cleanupStaleLocks(dbPath);
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
      
      const db = new PouchDB(dbName, {
        ...DB_OPTIONS,
        deterministic_revs: true
      });
      
      // Test the database connection
      await db.info(); 
      
      databaseInstances.set(dbName, db);
      console.log(`Database ${dbName} created and info confirmed.`);
      return db;
      
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt + 1} failed for database ${dbName}:`, error.message);
      
      // If it's a lock error and we have more attempts, continue
      if (error.message.includes('lock') && attempt < retryCount - 1) {
        console.log(`Lock error detected, will retry in ${1000 * (attempt + 1)}ms...`);
        continue;
      }
      
      // If it's not a lock error or we're out of attempts, throw
      if (attempt === retryCount - 1) {
        console.error(`Failed to create database ${dbName} after ${retryCount} attempts`);
        throw error;
      }
    }
  }
  
  throw lastError;
};

/**
 * Close all database connections gracefully
 */
const closeAllDatabases = async () => {
  console.log('Closing all database connections...');
  const closePromises = [];
  
  for (const [name, db] of databaseInstances.entries()) {
    console.log(`Closing database: ${name}`);
    closePromises.push(
      db.close().catch(error => {
        console.warn(`Error closing database ${name}:`, error.message);
      })
    );
  }
  
  await Promise.all(closePromises);
  databaseInstances.clear();
  console.log('All databases closed');
};

// Clean up on app exit
app.on('before-quit', async () => {
  await closeAllDatabases();
});

app.on('window-all-closed', async () => {
  await closeAllDatabases();
});

/**
 * Helper function to serialize error objects for IPC
 */
const serializeError = (error) => {
  return {
    message: error.message,
    name: error.name,
    status: error.status,
    statusCode: error.statusCode,
    error: error.error,
    reason: error.reason,
    stack: error.stack
  };
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
      return { success: false, error: serializeError(error) };
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
      return { success: false, error: serializeError(error) };
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
      return { success: false, error: serializeError(error) };
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
      return { success: false, error: serializeError(error) };
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
      return { success: false, error: serializeError(error) };
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
      return { success: false, error: serializeError(error) };
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
      return { success: false, error: serializeError(error) };
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
      return { success: false, error: serializeError(error) };
    }
  });

  // Bulk docs operation. 'dbName' received is the suffix.
  ipcMain.handle('db:bulkDocs', async (event, { dbName, docs, options = {} }) => {
    try {
      const db = await getDatabase(dbName);
      const result = await db.bulkDocs(docs, options);
      return { success: true, result };
    } catch (error) {
      console.error(`Error in db:bulkDocs for '${dbName}':`, error);
      return { success: false, error: serializeError(error) };
    }
  });

  // Add a handler to manually clean up locks if needed
  ipcMain.handle('db:cleanup-locks', async (event) => {
    try {
      console.log('Manual lock cleanup requested...');
      const dbPath = getAppDataPath();
      
      if (!fs.existsSync(dbPath)) {
        return { success: true, message: 'Database directory does not exist' };
      }
      
      const entries = fs.readdirSync(dbPath);
      let cleanedCount = 0;
      
      for (const entry of entries) {
        const entryPath = path.join(dbPath, entry);
        if (fs.statSync(entryPath).isDirectory()) {
          await cleanupStaleLocks(entryPath);
          cleanedCount++;
        }
      }
      
      return { 
        success: true, 
        message: `Checked ${cleanedCount} database directories for stale locks` 
      };
    } catch (error) {
      console.error('Error during manual lock cleanup:', error);
      return { success: false, error: serializeError(error) };
    }
  });
} 