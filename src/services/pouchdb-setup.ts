// Import PouchDB as an ESM module
import PouchDBModule from 'pouchdb';
import PouchDBFindModule from 'pouchdb-find';

// Use type assertions to handle the module exports
// @ts-ignore - Handle both CommonJS and ESM module patterns
const PouchDB: typeof PouchDBModule = (PouchDBModule as any).default || PouchDBModule;
// @ts-ignore - Handle both CommonJS and ESM module patterns
const PouchDBFind = (PouchDBFindModule as any).default || PouchDBFindModule;

// Register the PouchDB find plugin
PouchDB.plugin(PouchDBFind);

// Create DB namespace
const DB_NAME = 'friday-app';

// Export a factory function to create database instances
export const createDatabase = <T = any>(name: string) => {
  return new PouchDB<T>(`${DB_NAME}-${name}`);
};

// Export the configured PouchDB class
export default PouchDB; 