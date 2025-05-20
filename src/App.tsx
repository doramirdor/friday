import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import AppToolbar from "@/components/app-toolbar";
import IndexPage from "@/pages/Index";
import LibraryPage from "@/pages/Library";
import TranscriptDetailsPage from "@/pages/TranscriptDetails";
import NotFoundPage from "@/pages/NotFound";
import DatabaseProvider from "@/context/DatabaseContext";
import ErrorBoundary from "@/components/ErrorBoundary";
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

function App({ isElectron = false }: AppProps) {
  // We can use the isElectron prop to conditionally render things or enable features
  console.log(`Running in ${isElectron ? 'Electron' : 'Web'} environment`);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="friday-ui-theme">
        <DatabaseProvider>
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
          <Toaster position="top-center" />
        </DatabaseProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
