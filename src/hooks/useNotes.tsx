
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
      case 'list-ordered':
        // Split the selected text by new line and add numbers
        if (selectedText) {
          const lines = selectedText.split('\n');
          const numberedLines = lines.map((line, i) => `${i + 1}. ${line}`);
          formattedText = numberedLines.join('\n');
        } else {
          formattedText = '1. ';
        }
        break;
      case 'list-unordered':
        // Split the selected text by new line and add bullets
        if (selectedText) {
          const lines = selectedText.split('\n');
          const bulletedLines = lines.map(line => `• ${line}`);
          formattedText = bulletedLines.join('\n');
        } else {
          formattedText = '• ';
        }
        break;
      case 'heading':
        formattedText = `<h3>${selectedText}</h3>`;
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
  
  // Function to clear formatting
  const clearFormatting = () => {
    const textarea = document.querySelector('textarea#notes') as HTMLTextAreaElement;
    
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = notes.substring(start, end);
    
    // Remove HTML tags
    const plainText = selectedText.replace(/<[^>]*>/g, '');
    
    setNotes(
      notes.substring(0, start) + plainText + notes.substring(end)
    );
    
    // Focus back on textarea
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + plainText.length);
    }, 0);
  };
  
  return { notes, setNotes, formatText, clearFormatting };
}
