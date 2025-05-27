import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import AppToolbar from "@/components/app-toolbar";
import IndexPage from "@/pages/Index";
import LibraryPage from "@/pages/Library";
import TranscriptDetailsPage from "@/pages/TranscriptDetails";
import NotFoundPage from "@/pages/NotFound";
import { DatabaseProvider, useDatabase } from "@/context/DatabaseContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import DatabaseErrorRecovery from "@/components/DatabaseErrorRecovery";
import "./App.css";

interface AppProps {
  isElectron?: boolean;
}

// Layout component for pages with the toolbar
const Layout = () => {
  return (
    <div className="flex flex-col h-screen">
      <AppToolbar />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

// App content component that can access database context
const AppContent = () => {
  const { isInitialized, isLoading, error } = useDatabase();

  // Show error recovery component if there's a database error
  if (error && !isLoading) {
    return <DatabaseErrorRecovery error={error} />;
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing database...</p>
        </div>
      </div>
    );
  }

  // Show main app when database is ready
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/library" />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/transcript/:id" element={<TranscriptDetailsPage />} />
      </Routes>
    </BrowserRouter>
  );
};

function App({ isElectron = false }: AppProps) {
  // We can use the isElectron prop to conditionally render things or enable features
  console.log(`Running in ${isElectron ? 'Electron' : 'Web'} environment`);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="friday-ui-theme">
        <DatabaseProvider>
          <AppContent />
          <Toaster position="bottom-right" />
        </DatabaseProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
