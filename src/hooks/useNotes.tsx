import { useState, useEffect } from 'react';
import { DatabaseService } from '@/services/database';

export function useNotes(transcriptId: string) {
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load notes from database on initial render
  useEffect(() => {
    const fetchNotes = async () => {
      if (!transcriptId || transcriptId === 'new') {
        // Don't try to load notes for new meetings
        return;
      }
      
      try {
        const noteData = await DatabaseService.getNotes(transcriptId);
        if (noteData && typeof noteData.content === 'string') {
          setNotes(noteData.content);
        }
        setError(null);
      } catch (err) {
        console.error('Error loading notes:', err);
        setError('Failed to load notes');
      }
    };
    
    fetchNotes();
  }, [transcriptId]);
  
  // Save notes to database (debounced with longer delay to reduce frequency)
  useEffect(() => {
    if (!transcriptId || transcriptId === 'new' || !notes || notes.trim().length < 3) {
      return;
    }
    
    const saveTimer = setTimeout(async () => {
      try {
        setIsSaving(true);
        await DatabaseService.saveNotes({
          meetingId: transcriptId,
          content: notes,
          type: 'notes',
          updatedAt: new Date().toISOString(),
        });
        setError(null);
      } catch (err) {
        console.error('Error saving notes:', err);
        setError('Failed to save notes');
      } finally {
        setIsSaving(false);
      }
    }, 3000); // 3 second debounce to reduce auto-save frequency
    
    return () => clearTimeout(saveTimer);
  }, [notes, transcriptId]);
  
  // Function to handle text formatting
  const formatText = (type: 'bold' | 'italic' | 'link' | 'list-ordered' | 'list-unordered' | 'heading') => {
    const textarea = document.querySelector('textarea#notes') as HTMLTextAreaElement;
    
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = notes.substring(start, end);
    const beforeText = notes.substring(0, start);
    const afterText = notes.substring(end);
    
    let formattedText = '';
    
    switch (type) {
      case 'bold':
        formattedText = `**${selectedText}**`;
        break;
      case 'italic':
        formattedText = `*${selectedText}*`;
        break;
      case 'link':
        formattedText = `[${selectedText}](url)`;
        break;
      case 'list-ordered':
        formattedText = `1. ${selectedText}`;
        break;
      case 'list-unordered':
        formattedText = `- ${selectedText}`;
        break;
      case 'heading':
        formattedText = `# ${selectedText}`;
        break;
      default:
        formattedText = selectedText;
    }
    
    setNotes(beforeText + formattedText + afterText);
    
    // Set focus back to textarea and restore selection
    textarea.focus();
    textarea.setSelectionRange(
      start + formattedText.length,
      start + formattedText.length
    );
  };
  
  return { 
    notes, 
    setNotes, 
    formatText,
    isSaving,
    error
  };
}
