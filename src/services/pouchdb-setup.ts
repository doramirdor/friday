// PouchDB setup that uses the electronAPI for database operations.
// This approach bypasses ESM/CommonJS compatibility problems by relying on IPC.

// Types for TypeScript
interface DatabaseResponse<T> {
  success: boolean;
  error?: string;
  result?: T;
  info?: any; // PouchDB info object structure can be complex
  doc?: T;
}

// Define a more specific type for PouchDB-like operations via IPC
// This helps in providing intellisense for the available methods.
export interface IpcPouchDB<T = any> {
  get: (id: string) => Promise<T>;
  put: (doc: T) => Promise<any>; // Response from put can vary
  remove: (doc: T) => Promise<any>; // Response from remove can vary
  find: (options: any) => Promise<any>; // PouchDB-find options and result
  info: () => Promise<any>; // PouchDB info object
}

/**
 * Create a database instance proxy that communicates via IPC with the main process.
 */
export const createDatabase = async <T = any>(name: string): Promise<IpcPouchDB<T>> => {
  const electronAPI = (window as any).electronAPI;

  if (!electronAPI?.isElectron || !electronAPI.database) {
    console.error('Electron API or database module is not available on window.electronAPI');
    throw new Error('This application requires Electron with a fully initialized database API to run.');
  }

  try {
    // Call the main process to ensure the database (or its PouchDB instance) is created/initialized.
    // The 'name' here usually corresponds to the suffix of the database name, e.g., 'user-settings' for 'friday-app-user-settings'.
    const response: DatabaseResponse<any> = await electronAPI.database.create(name, {}); // options can be passed if needed
    
    if (!response.success) {
      console.error(`Failed to create/initialize database '${name}' via IPC:`, response.error);
      throw new Error(response.error || `Failed to create/initialize database '${name}'.`);
    }
    console.log(`✅ Database '${name}' ready via IPC. Info:`, response.info);

    // Return a proxy object that implements the IpcPouchDB interface
    // The 'name' passed to electronAPI.database methods should be the short name (e.g., 'user-settings')
    // as the main process handler (database-handler.js) prepends 'friday-app-' to it.
    return {
      async get(id: string): Promise<T> {
        const response: DatabaseResponse<T> = await electronAPI.database.get(name, id);
        if (!response.success || response.doc === undefined) throw new Error(response.error || 'Document not found or error in get');
        return response.doc;
      },

      async put(doc: T): Promise<any> {
        const response: DatabaseResponse<any> = await electronAPI.database.put(name, doc);
        if (!response.success) throw new Error(response.error || 'Error in put operation');
        return response.result;
      },

      async remove(doc: T): Promise<any> {
        const response: DatabaseResponse<any> = await electronAPI.database.remove(name, doc);
        if (!response.success) throw new Error(response.error || 'Error in remove operation');
        return response.result;
      },

      async find(options: any): Promise<any> {
        // Ensure `pouchdb-find` plugin is registered on PouchDB instances in the main process.
        const response: DatabaseResponse<any> = await electronAPI.database.query(name, options);
        if (!response.success) throw new Error(response.error || 'Error in find/query operation');
        return response.result;
      },

      async info(): Promise<any> {
        const response: DatabaseResponse<any> = await electronAPI.database.info(name);
        if (!response.success) throw new Error(response.error || 'Error fetching database info');
        return response.info;
      }
    };
  } catch (error) {
    console.error(`❌ Error creating or interacting with database '${name}' via IPC:`, error);
    throw error;
  }
};

/**
 * Default export is a dummy function or can be removed if not used.
 * Direct PouchDB access from the renderer is not supported with this setup.
 */
export default () => {
  console.warn('Direct PouchDB constructor access is not supported from the renderer. Use createDatabase() instead.');
  throw new Error('Direct PouchDB access is not supported. Use createDatabase() via electronAPI.');
}; 