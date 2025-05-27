import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DatabaseService } from '@/services/database';
import { toast } from 'sonner';

interface DatabaseContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  retryInitialization: () => Promise<void>;
  cleanupLocks: () => Promise<{ success: boolean; message: string }>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};

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
      
      // Show different messages for lock errors
      if (errorMessage.includes('lock')) {
        toast.error(`Database lock error: ${errorMessage}. Try the "Fix Database" button below.`);
      } else {
        toast.error(`Database initialization failed: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const retryInitialization = async () => {
    await initDatabase();
  };

  const cleanupLocks = async (): Promise<{ success: boolean; message: string }> => {
    try {
      setIsLoading(true);
      const result = await DatabaseService.cleanupDatabaseLocks();
      
      if (result.success) {
        setError(null);
        setIsInitialized(true);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Lock cleanup failed';
      toast.error(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsLoading(false);
    }
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

  const value: DatabaseContextType = {
    isInitialized,
    isLoading,
    error,
    retryInitialization,
    cleanupLocks
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};

export default DatabaseProvider; 