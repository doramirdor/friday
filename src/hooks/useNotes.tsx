
import { useState, useEffect } from 'react';

export function useNotes(transcriptId: string) {
  const storageKey = `friday-notes-${transcriptId}`;
  const [notes, setNotes] = useState('');
  
  // Load notes from localStorage on initial render
  useEffect(() => {
    const savedNotes = localStorage.getItem(storageKey);
    if (savedNotes) {
      setNotes(savedNotes);
    }
  }, [storageKey]);
  
  // Save notes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(storageKey, notes);
  }, [notes, storageKey]);
  
  // Function to handle text formatting
  const formatText = (type: 'bold' | 'italic' | 'link') => {
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
        formattedText = `<strong>${selectedText}</strong>`;
        break;
      case 'italic':
        formattedText = `<em>${selectedText}</em>`;
        break;
      case 'link':
        const url = prompt('Enter URL:', 'https://');
        if (url) {
          formattedText = `<a href="${url}" target="_blank">${selectedText || url}</a>`;
        } else {
          return; // User canceled prompt
        }
        break;
      default:
        formattedText = selectedText;
    }
    
    setNotes(beforeText + formattedText + afterText);
    
    // Focus back on textarea after formatting
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        beforeText.length + formattedText.length,
        beforeText.length + formattedText.length
      );
    }, 0);
  };
  
  return { notes, setNotes, formatText };
}
