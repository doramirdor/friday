import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

// Define types
export interface TranscriptLine {
  id: string;
  text: string;
  speakerId: string;
  timestamp?: number;
}

export interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface TranscriptData {
  meetingId: string;
  timestamp: string;
  transcript: TranscriptLine[];
  speakers: Speaker[];
}

interface TranscriptWindowAPI {
  transcriptAPI?: {
    saveTranscript: (meetingId: string, transcript: TranscriptLine[], speakerInfo: Speaker[]) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    loadTranscript: (filePath: string) => Promise<{ success: boolean; data?: TranscriptData; error?: string }>;
    exportTranscript: (data: TranscriptData, format: string, outputPath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    updateTranscript: (meetingId: string, transcript: TranscriptLine[], speakerInfo: Speaker[]) => Promise<{ success: boolean; error?: string }>;
    searchTranscripts: (searchTerm: string) => Promise<{ success: boolean; results?: { filePath: string; excerpt: string }[]; error?: string }>;
    getTranscriptsList: () => Promise<{ success: boolean; transcripts?: { filePath: string; meetingId: string; timestamp: string }[]; error?: string }>;
    deleteTranscript: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    onTranscriptUpdated: (callback: (data: any) => void) => void;
    onTranscriptLoaded: (callback: (data: any) => void) => void;
    onExportComplete: (callback: (data: any) => void) => void;
  };
}

export default function useTranscript(meetingId: string) {
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState<boolean>(true);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // Check if we're running in Electron
  useEffect(() => {
    const isElectronEnv = !!(window as unknown as TranscriptWindowAPI)?.transcriptAPI;
    setIsElectron(isElectronEnv);
    
    if (!isElectronEnv) {
      console.warn('useTranscript: Running in browser environment, some features may be limited');
    }
  }, []);

  // Save transcript to file
  const saveTranscript = useCallback(async () => {
    if (!isElectron) {
      console.warn('saveTranscript: Not running in Electron environment');
      return { success: false, error: 'Not running in Electron environment' };
    }
    
    if (!meetingId) {
      return { success: false, error: 'No meeting ID provided' };
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      
      if (!transcriptAPI) {
        throw new Error('Transcript API not available');
      }
      
      const result = await transcriptAPI.saveTranscript(meetingId, transcriptLines, speakers);
      
      if (result.success && result.filePath) {
        setSavedFilePath(result.filePath);
        toast.success('Transcript saved successfully');
      } else {
        throw new Error(result.error || 'Failed to save transcript');
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error saving transcript';
      setError(errorMessage);
      toast.error(`Error saving transcript: ${errorMessage}`);
      
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, meetingId, transcriptLines, speakers]);

  // Load transcript from file
  const loadTranscript = useCallback(async (filePath: string) => {
    if (!isElectron) {
      console.warn('loadTranscript: Not running in Electron environment');
      return null;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      
      if (!transcriptAPI) {
        throw new Error('Transcript API not available');
      }
      
      const result = await transcriptAPI.loadTranscript(filePath);
      
      if (result.success && result.data) {
        setTranscriptLines(result.data.transcript);
        setSpeakers(result.data.speakers);
        setSavedFilePath(filePath);
        toast.success('Transcript loaded successfully');
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to load transcript');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error loading transcript';
      setError(errorMessage);
      toast.error(`Error loading transcript: ${errorMessage}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron]);

  // Export transcript to different formats
  const exportTranscript = useCallback(async (format: string, outputPath: string) => {
    if (!isElectron) {
      console.warn('exportTranscript: Not running in Electron environment');
      return { success: false, error: 'Not running in Electron environment' };
    }
    
    if (transcriptLines.length === 0) {
      return { success: false, error: 'No transcript data to export' };
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      
      if (!transcriptAPI) {
        throw new Error('Transcript API not available');
      }
      
      const data: TranscriptData = {
        meetingId,
        timestamp: new Date().toISOString(),
        transcript: transcriptLines,
        speakers: speakers
      };
      
      const result = await transcriptAPI.exportTranscript(data, format, outputPath);
      
      if (result.success) {
        toast.success(`Transcript exported as ${format.toUpperCase()}`);
      } else {
        throw new Error(result.error || `Failed to export transcript as ${format}`);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error exporting transcript';
      setError(errorMessage);
      toast.error(`Error exporting transcript: ${errorMessage}`);
      
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, meetingId, transcriptLines, speakers]);

  // Add a line to the transcript
  const addTranscriptLine = useCallback((line: Omit<TranscriptLine, 'id'>) => {
    const newLine: TranscriptLine = {
      ...line,
      id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    };
    
    setTranscriptLines(prev => [...prev, newLine]);
    
    // Auto-save if enabled
    if (isAutoSaveEnabled && isElectron) {
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      if (transcriptAPI) {
        transcriptAPI.updateTranscript(meetingId, [...transcriptLines, newLine], speakers)
          .catch(err => console.error('Auto-save error:', err));
      }
    }
    
    return newLine;
  }, [meetingId, transcriptLines, speakers, isAutoSaveEnabled, isElectron]);

  // Update an existing transcript line
  const updateTranscriptLine = useCallback((id: string, updates: Partial<Omit<TranscriptLine, 'id'>>) => {
    setTranscriptLines(prev => 
      prev.map(line => 
        line.id === id ? { ...line, ...updates } : line
      )
    );
    
    // Auto-save if enabled
    if (isAutoSaveEnabled && isElectron) {
      const updatedLines = transcriptLines.map(line => 
        line.id === id ? { ...line, ...updates } : line
      );
      
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      if (transcriptAPI) {
        transcriptAPI.updateTranscript(meetingId, updatedLines, speakers)
          .catch(err => console.error('Auto-save error:', err));
      }
    }
  }, [meetingId, transcriptLines, speakers, isAutoSaveEnabled, isElectron]);

  // Delete a transcript line
  const deleteTranscriptLine = useCallback((id: string) => {
    setTranscriptLines(prev => prev.filter(line => line.id !== id));
    
    // Auto-save if enabled
    if (isAutoSaveEnabled && isElectron) {
      const updatedLines = transcriptLines.filter(line => line.id !== id);
      
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      if (transcriptAPI) {
        transcriptAPI.updateTranscript(meetingId, updatedLines, speakers)
          .catch(err => console.error('Auto-save error:', err));
      }
    }
  }, [meetingId, transcriptLines, speakers, isAutoSaveEnabled, isElectron]);

  // Add a speaker
  const addSpeaker = useCallback((speaker: Omit<Speaker, 'id'>) => {
    const newSpeaker: Speaker = {
      ...speaker,
      id: `speaker_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    };
    
    setSpeakers(prev => [...prev, newSpeaker]);
    
    // Auto-save if enabled
    if (isAutoSaveEnabled && isElectron) {
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      if (transcriptAPI) {
        transcriptAPI.updateTranscript(meetingId, transcriptLines, [...speakers, newSpeaker])
          .catch(err => console.error('Auto-save error:', err));
      }
    }
    
    return newSpeaker;
  }, [meetingId, transcriptLines, speakers, isAutoSaveEnabled, isElectron]);

  // Update an existing speaker
  const updateSpeaker = useCallback((id: string, updates: Partial<Omit<Speaker, 'id'>>) => {
    setSpeakers(prev => 
      prev.map(speaker => 
        speaker.id === id ? { ...speaker, ...updates } : speaker
      )
    );
    
    // Auto-save if enabled
    if (isAutoSaveEnabled && isElectron) {
      const updatedSpeakers = speakers.map(speaker => 
        speaker.id === id ? { ...speaker, ...updates } : speaker
      );
      
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      if (transcriptAPI) {
        transcriptAPI.updateTranscript(meetingId, transcriptLines, updatedSpeakers)
          .catch(err => console.error('Auto-save error:', err));
      }
    }
  }, [meetingId, transcriptLines, speakers, isAutoSaveEnabled, isElectron]);

  // Delete a speaker
  const deleteSpeaker = useCallback((id: string) => {
    setSpeakers(prev => prev.filter(speaker => speaker.id !== id));
    
    // Auto-save if enabled
    if (isAutoSaveEnabled && isElectron) {
      const updatedSpeakers = speakers.filter(speaker => speaker.id !== id);
      
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      if (transcriptAPI) {
        transcriptAPI.updateTranscript(meetingId, transcriptLines, updatedSpeakers)
          .catch(err => console.error('Auto-save error:', err));
      }
    }
  }, [meetingId, transcriptLines, speakers, isAutoSaveEnabled, isElectron]);

  // Toggle auto-save
  const toggleAutoSave = useCallback(() => {
    setIsAutoSaveEnabled(prev => !prev);
  }, []);

  // Clear all transcript data
  const clearTranscript = useCallback(() => {
    setTranscriptLines([]);
    setSavedFilePath(null);
    
    // Auto-save if enabled
    if (isAutoSaveEnabled && isElectron) {
      const transcriptAPI = (window as unknown as TranscriptWindowAPI).transcriptAPI;
      if (transcriptAPI) {
        transcriptAPI.updateTranscript(meetingId, [], speakers)
          .catch(err => console.error('Auto-save error:', err));
      }
    }
  }, [meetingId, speakers, isAutoSaveEnabled, isElectron]);

  return {
    transcriptLines,
    speakers,
    isLoading,
    error,
    isElectron,
    isAutoSaveEnabled,
    savedFilePath,
    saveTranscript,
    loadTranscript,
    exportTranscript,
    addTranscriptLine,
    updateTranscriptLine,
    deleteTranscriptLine,
    addSpeaker,
    updateSpeaker,
    deleteSpeaker,
    toggleAutoSave,
    clearTranscript
  };
} 