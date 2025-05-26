// Base interface for PouchDB documents
export interface PouchDocument {
  _id?: string;
  _rev?: string;
}

// Interface for Meeting data
export interface Meeting extends PouchDocument {
  title: string;
  description: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  tags: string[];
  recordingPath?: string; // Path to audio recording file
  recordingDuration?: number; // Duration in seconds
  liveTranscript: boolean;
  type: 'meeting'; // Document type for querying
}

// Interface for Transcript lines
export interface TranscriptLine extends PouchDocument {
  id: string;
  meetingId: string;
  text: string;
  speakerId: string;
  timestamp?: number; // Optional timestamp in seconds
  type: 'transcriptLine'; // Document type for querying
}

// Interface for Speaker data
export interface Speaker extends PouchDocument {
  id: string;
  meetingId: string;
  name: string;
  color: string;
  type: 'speaker'; // Document type for querying
}

// Interface for Action Item
export interface ActionItem extends PouchDocument {
  id: string;
  meetingId: string;
  text: string;
  completed: boolean;
  type: 'actionItem'; // Document type for querying
  updatedAt: string;
}

// Interface for Notes related to a meeting
export interface Notes extends PouchDocument {
  meetingId: string;
  content: string;
  updatedAt: string; // ISO date string
  type: 'notes'; // Document type for querying
}

// Interface for Context data
export interface Context extends PouchDocument {
  meetingId: string;
  name: string;
  content?: string; // Text content for the context
  files: string[];
  overrideGlobal: boolean;
  type: 'context'; // Document type for querying
  updatedAt: string;
}

// Interface for Context File
export interface ContextFile extends PouchDocument {
  id: string;
  name: string;
  size: string;
  type: string; // File type (PDF, Text, etc.)
  mimeType?: string; // Actual MIME type
  path?: string; // Path to the file if stored on disk
  content?: string; // Content for small files or preview
  addedAt: string; // ISO date string
  updatedAt?: string; // ISO date string
  dbType: 'contextFile'; // Document type for querying
  createdAt: string;
}

// Interface for Global Context
export interface GlobalContext extends PouchDocument {
  name: string;
  description: string;
  files: string[]; // IDs of ContextFile documents
  updatedAt: string; // ISO date string
  type: 'globalContext'; // Document type for querying
  _id?: string;
  _rev?: string;
}

// Full meeting data including related items
export interface MeetingDetails {
  meeting: Meeting;
  transcript: TranscriptLine[];
  speakers: Speaker[];
  actionItems: ActionItem[];
  notes: Notes;
  context: Context;
}

// For the recording list view
export interface RecordingListItem {
  id: string;
  title: string;
  createdAt: Date;
  duration: number;
  tags: string[];
  path?: string;
}

// Interface for user settings
export interface UserSettings extends PouchDocument {
  liveTranscript: boolean;
  apiKey?: string;
  geminiApiKey?: string; // Gemini AI API key for meeting analysis
  theme?: string;
  autoLaunch?: boolean;
  saveLocation?: string;
  recordingSource?: 'system' | 'mic' | 'both';
  systemAudioDevice?: string;
  microphoneDevice?: string;
  isVolumeBoostEnabled?: boolean;
  volumeLevel?: number;
  updatedAt: string; // ISO date string
  type: 'settings'; // Document type for querying
} 