
import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import AppToolbar from "@/components/app-toolbar";
import IndexPage from "@/pages/Index";
import LibraryPage from "@/pages/Library";
import TranscriptDetailsPage from "@/pages/TranscriptDetails";
import NotFoundPage from "@/pages/NotFound";
import MockTranscriptPage from "@/pages/MockTranscript";
import "./App.css";

interface AppProps {
  isElectron?: boolean;
}

function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppToolbar />
      <Outlet />
    </div>
  );
}

function App({ isElectron = false }: AppProps) {
  // We can use the isElectron prop to conditionally render things or enable features
  console.log(`Running in ${isElectron ? 'Electron' : 'Web'} environment`);

  return (
    <ThemeProvider defaultTheme="light" storageKey="friday-ui-theme">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/library" />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="/transcript/:id" element={<TranscriptDetailsPage />} />
          <Route path="/transcript/123" element={<MockTranscriptPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" />
    </ThemeProvider>
  );
}

export default App;
