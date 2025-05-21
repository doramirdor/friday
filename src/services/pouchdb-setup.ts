// Import PouchDB as an ESM module
import PouchDBModule from 'pouchdb';
import PouchDBFindModule from 'pouchdb-find';

// Create a properly working PouchDB instance
// This ensures we handle both CommonJS and ESM module formats correctly
// @ts-ignore - Handle both CommonJS and ESM module patterns
const PouchDB = (PouchDBModule as any).default || PouchDBModule;
// @ts-ignore - Handle both CommonJS and ESM module patterns
const PouchDBFind = (PouchDBFindModule as any).default || PouchDBFindModule;

// Register the PouchDB find plugin
PouchDB.plugin(PouchDBFind);

// Create DB namespace
const DB_NAME = 'friday-app';

// Export a factory function to create database instances
export const createDatabase = <T = any>(name: string) => {
  // @ts-ignore - Handle PouchDB typing for new instances
  return new PouchDB(`${DB_NAME}-${name}`);
};

// Export the configured PouchDB class
export default PouchDB; 