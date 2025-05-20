import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error caught by ErrorBoundary:', error);
    console.error('Component stack:', errorInfo.componentStack);
    
    // Check if it's a PouchDB related error
    if (error.message.includes('PouchDB') || 
        error.message.includes('Class extends value') ||
        error.message.includes('not a constructor')) {
      console.warn('Detected PouchDB error - attempting recovery');
      
      // Clear PouchDB data from localStorage
      const keys = Object.keys(localStorage);
      const pouchdbKeys = keys.filter(key => 
        key.startsWith('_pouch_') || key.startsWith('friday-app-')
      );
      
      for (const key of pouchdbKeys) {
        console.log(`Removing: ${key}`);
        localStorage.removeItem(key);
      }
      
      // Force reload after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return this.props.fallback || (
        <div className="p-4 flex items-center justify-center min-h-screen">
          <div className="bg-red-50 border border-red-200 rounded-lg shadow p-6 max-w-md">
            <h2 className="text-xl font-bold text-red-800 mb-3">Something went wrong</h2>
            <p className="text-red-600 mb-4">
              {this.state.error?.message || 'An unknown error occurred'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              The application has encountered an error. Please try reloading the page.
            </p>
            <button 
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
            <button 
              className="ml-2 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
            >
              Clear Data & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 