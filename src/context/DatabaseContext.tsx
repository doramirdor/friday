import React, { createContext, useContext, useState, useEffect } from 'react';
import { DatabaseService } from '@/services/database';
import { toast } from 'sonner';

interface DatabaseContextProps {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  retryInitialization: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextProps>({
  isInitialized: false,
  isLoading: true,
  error: null,
  retryInitialization: async () => {}
});

export const useDatabase = () => useContext(DatabaseContext);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initDatabase = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await DatabaseService.initDatabase();
      setIsInitialized(true);
      console.log("Database initialized successfully");
    } catch (err) {
      console.error('Error initializing database:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize database';
      setError(errorMessage);
      toast.error(`Database initialization failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const retryInitialization = async () => {
    await initDatabase();
  };

  useEffect(() => {
    initDatabase();
    
    // Add error listener for debugging purposes
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled Promise Rejection:', event.reason);
      if (event.reason?.message?.includes('PouchDB')) {
        console.error('PouchDB error detected:', event.reason);
      }
    });
    
    return () => {
      window.removeEventListener('unhandledrejection', () => {});
    };
  }, []);

  // Provide a simplified version of the app when database initialization fails
  if (error && !isLoading) {
    return (
      <DatabaseContext.Provider
        value={{
          isInitialized,
          isLoading,
          error,
          retryInitialization
        }}
      >
        <div className="p-4 max-w-md mx-auto mt-8 bg-red-50 border border-red-300 rounded shadow-md">
          <h1 className="text-xl font-bold text-red-800 mb-4">Database Error</h1>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button 
            onClick={retryInitialization}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Retry Initialization
          </button>
        </div>
        {children}
      </DatabaseContext.Provider>
    );
  }

  return (
    <DatabaseContext.Provider
      value={{
        isInitialized,
        isLoading,
        error,
        retryInitialization
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
};

export default DatabaseProvider; 