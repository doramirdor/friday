// Interface for Meeting data
export interface Meeting {
  _id?: string; // PouchDB document ID
  _rev?: string; // PouchDB revision
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
export interface TranscriptLine {
  id: string;
  speakerId: string;
  text: string;
  timestamp?: number; // Optional timestamp in seconds
  isEditing?: boolean; // UI state, not stored in DB
}

// Interface for Speaker data
export interface Speaker {
  id: string;
  name: string;
  color: string;
}

// Interface for Action Item
export interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
  meetingId: string; // Reference to meeting
  createdAt: string; // ISO date string
  completedAt?: string; // ISO date string for when it was completed
  type: 'actionItem'; // Document type for querying
}

// Interface for Notes related to a meeting
export interface Notes {
  _id?: string; // PouchDB document ID
  _rev?: string; // PouchDB revision
  meetingId: string; // Reference to meeting
  content: string;
  updatedAt: string; // ISO date string
  type: 'notes'; // Document type for querying
}

// Interface for Context data
export interface Context {
  _id?: string; // PouchDB document ID
  _rev?: string; // PouchDB revision
  name: string;
  files: string[];
  overrideGlobal: boolean;
  meetingId: string; // Reference to meeting
  type: 'context'; // Document type for querying
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