import React, { createContext, useContext, useState, useEffect } from 'react';
import { DatabaseService } from '@/services/database';

interface DatabaseContextProps {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

const DatabaseContext = createContext<DatabaseContextProps>({
  isInitialized: false,
  isLoading: true,
  error: null
});

export const useDatabase = () => useContext(DatabaseContext);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initDatabase = async () => {
      try {
        setIsLoading(true);
        await DatabaseService.initDatabase();
        setIsInitialized(true);
        setError(null);
      } catch (err) {
        console.error('Error initializing database:', err);
        setError('Failed to initialize database');
      } finally {
        setIsLoading(false);
      }
    };

    initDatabase();
  }, []);

  return (
    <DatabaseContext.Provider
      value={{
        isInitialized,
        isLoading,
        error
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
};

export default DatabaseProvider; 