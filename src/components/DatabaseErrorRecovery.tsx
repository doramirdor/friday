import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Wrench } from 'lucide-react';
import { useDatabase } from '@/context/DatabaseContext';

interface DatabaseErrorRecoveryProps {
  error: string;
}

const DatabaseErrorRecovery: React.FC<DatabaseErrorRecoveryProps> = ({ error }) => {
  const { retryInitialization, cleanupLocks } = useDatabase();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const isLockError = error.includes('lock') || error.includes('Resource temporarily unavailable');

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryInitialization();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCleanupLocks = async () => {
    setIsCleaningUp(true);
    try {
      await cleanupLocks();
    } finally {
      setIsCleaningUp(false);
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto mt-8 bg-red-50 border border-red-300 rounded-lg shadow-md">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="h-6 w-6 text-red-600" />
        <h1 className="text-xl font-bold text-red-800">Database Error</h1>
      </div>
      
      <div className="mb-4">
        <p className="text-sm text-red-700 mb-2">
          {isLockError 
            ? "The database is locked by another process. This usually happens when the app didn't close properly or multiple instances are running."
            : "There was an error initializing the database."
          }
        </p>
        <details className="mt-2">
          <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
            Show technical details
          </summary>
          <pre className="text-xs text-red-600 mt-2 p-2 bg-red-100 rounded overflow-auto max-h-32">
            {error}
          </pre>
        </details>
      </div>

      <div className="flex flex-col gap-3">
        {isLockError && (
          <Button
            onClick={handleCleanupLocks}
            disabled={isCleaningUp}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            {isCleaningUp ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            {isCleaningUp ? 'Fixing Database...' : 'Fix Database Lock'}
          </Button>
        )}
        
        <Button
          onClick={handleRetry}
          disabled={isRetrying}
          variant="outline"
          className="flex items-center gap-2"
        >
          {isRetrying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isRetrying ? 'Retrying...' : 'Retry Initialization'}
        </Button>
      </div>

      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-xs text-yellow-800">
          <strong>Tips:</strong>
          <br />• Make sure no other instances of the app are running
          <br />• Try restarting the application
          <br />• If the problem persists, the "Fix Database Lock" button can help resolve lock issues
        </p>
      </div>
    </div>
  );
};

export default DatabaseErrorRecovery; 