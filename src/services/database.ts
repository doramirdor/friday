import { createDatabase } from './pouchdb-setup';
import { 
  Meeting, 
  TranscriptLine, 
  Speaker, 
  ActionItem, 
  Notes, 
  Context,
  ContextFile,
  GlobalContext,
  MeetingDetails,
  RecordingListItem,
  UserSettings
} from '../models/types';
import checkAndUpgradePouchDB from './pouchdb-upgrade';

// Database instances - will be initialized in setupDatabases
let meetingsDb: any;
let transcriptsDb: any;
let speakersDb: any;
let actionItemsDb: any;
let notesDb: any;
let contextsDb: any;
let settingsDb: any;
let contextFilesDb: any;
let globalContextDb: any;

// Setup database instances
const setupDatabases = async () => {
  console.log('Setting up database instances...');
  
  // Create database instances for different data types
  meetingsDb = await createDatabase<Meeting>('meetings');
  transcriptsDb = await createDatabase('transcripts');
  speakersDb = await createDatabase<Speaker>('speakers');
  actionItemsDb = await createDatabase<ActionItem>('action-items');
  notesDb = await createDatabase<Notes>('notes');
  contextsDb = await createDatabase<Context>('contexts');
  settingsDb = await createDatabase<UserSettings>('settings');
  contextFilesDb = await createDatabase<ContextFile>('context-files');
  globalContextDb = await createDatabase<GlobalContext>('global-context');
  
  console.log('Database instances created successfully');
};

// Create indexes for efficient querying
const setupIndexes = async () => {
  try {
    // Make sure databases are initialized
    if (!meetingsDb) {
      await setupDatabases();
    }
    
    // Meeting index
    await meetingsDb.createIndex({
      index: { fields: ['type', 'createdAt'] }
    });

    // ActionItem index
    await actionItemsDb.createIndex({
      index: { fields: ['type', 'meetingId', 'completed'] }
    });

    // Notes index
    await notesDb.createIndex({
      index: { fields: ['type', 'meetingId'] }
    });

    // Context index
    await contextsDb.createIndex({
      index: { fields: ['type', 'meetingId'] }
    });

    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating database indexes:', error);
  }
};

// Initialize the database
export const initDatabase = async () => {
  try {
    // First, check for and fix any PouchDB version compatibility issues
    await checkAndUpgradePouchDB();
    
    // Set up database instances
    await setupDatabases();
    
    // Then set up database indexes
    await setupIndexes();
    
    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    // Re-throw to allow the error to be handled by the caller
    throw error;
  }
};

// Meeting CRUD Operations
export const createMeeting = async (meeting: Meeting): Promise<Meeting> => {
  try {
    const now = new Date().toISOString();
    const newMeeting: Meeting = {
      ...meeting,
      _id: meeting._id || `meeting_${now}`,
      createdAt: meeting.createdAt || now,
      updatedAt: now,
      type: 'meeting'
    };
    const response = await meetingsDb.put(newMeeting);
    return { ...newMeeting, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error creating meeting:', error);
    throw error;
  }
};

export const getMeeting = async (id: string): Promise<Meeting | null> => {
  try {
    return await meetingsDb.get(id);
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    console.error('Error getting meeting:', error);
    throw error;
  }
};

export const updateMeeting = async (meeting: Meeting): Promise<Meeting> => {
  try {
    const now = new Date().toISOString();
    const updatedMeeting: Meeting = {
      ...meeting,
      updatedAt: now
    };
    const response = await meetingsDb.put(updatedMeeting);
    return { ...updatedMeeting, _rev: response.rev };
  } catch (error) {
    console.error('Error updating meeting:', error);
    throw error;
  }
};

export const deleteMeeting = async (id: string): Promise<boolean> => {
  try {
    const doc = await meetingsDb.get(id);
    await meetingsDb.remove(doc);

    // Also delete associated data
    await deleteTranscript(id);
    await deleteActionItems(id);
    await deleteNotes(id);
    await deleteContext(id);

    return true;
  } catch (error) {
    console.error('Error deleting meeting:', error);
    throw error;
  }
};

export const getAllMeetings = async (): Promise<Meeting[]> => {
  try {
    const result = await meetingsDb.find({
      selector: {
        type: 'meeting'
      },
      sort: [{ createdAt: 'desc' }]
    });
    return result.docs;
  } catch (error) {
    console.error('Error getting all meetings:', error);
    throw error;
  }
};

export const getMeetingsList = async (): Promise<RecordingListItem[]> => {
  try {
    const meetings = await getAllMeetings();
    return meetings.map(meeting => ({
      id: meeting._id!,
      title: meeting.title,
      createdAt: new Date(meeting.createdAt),
      duration: meeting.recordingDuration || 0,
      tags: meeting.tags,
      path: meeting.recordingPath
    }));
  } catch (error) {
    console.error('Error getting meetings list:', error);
    throw error;
  }
};

// Transcript Operations
export const saveTranscript = async (meetingId: string, transcript: TranscriptLine[]): Promise<boolean> => {
  try {
    // Store each transcript line as a separate document with the meetingId
    await transcriptsDb.bulkDocs(
      transcript.map(line => ({
        ...line,
        _id: `transcript_${meetingId}_${line.id}`,
        meetingId,
        type: 'transcript'
      }))
    );
    return true;
  } catch (error) {
    console.error('Error saving transcript:', error);
    throw error;
  }
};

export const getTranscript = async (meetingId: string): Promise<TranscriptLine[]> => {
  try {
    const result = await transcriptsDb.find({
      selector: {
        meetingId,
        type: 'transcript'
      }
    });
    
    // Convert back to TranscriptLine format with required properties
    return result.docs.map(doc => ({
      id: doc.id,
      speakerId: doc.speakerId,
      text: doc.text,
      timestamp: doc.timestamp,
      type: 'transcript',
      meetingId: doc.meetingId,
      _id: doc._id,
      _rev: doc._rev
    }));
  } catch (error) {
    console.error('Error getting transcript:', error);
    throw error;
  }
};

export const deleteTranscript = async (meetingId: string): Promise<boolean> => {
  try {
    // Find all transcript lines for this meeting
    const result = await transcriptsDb.find({
      selector: {
        meetingId,
        type: 'transcript'
      }
    });
    
    // Delete all transcript lines
    await transcriptsDb.bulkDocs(
      result.docs.map(doc => ({
        ...doc,
        _deleted: true
      }))
    );
    
    return true;
  } catch (error) {
    console.error('Error deleting transcript:', error);
    throw error;
  }
};

// Speakers Operations
export const saveSpeakers = async (meetingId: string, speakers: Speaker[]): Promise<boolean> => {
  try {
    // Store each speaker as a separate document with the meetingId
    await speakersDb.bulkDocs(
      speakers.map(speaker => ({
        ...speaker,
        _id: `speaker_${meetingId}_${speaker.id}`,
        meetingId,
        type: 'speaker'
      }))
    );
    return true;
  } catch (error) {
    console.error('Error saving speakers:', error);
    throw error;
  }
};

export const getSpeakers = async (meetingId: string): Promise<Speaker[]> => {
  try {
    const result = await speakersDb.find({
      selector: {
        meetingId,
        type: 'speaker'
      }
    });
    
    // Convert back to Speaker format with required properties
    return result.docs.map(doc => ({
      id: doc.id,
      name: doc.name,
      color: doc.color,
      type: 'speaker',
      meetingId: doc.meetingId,
      _id: doc._id,
      _rev: doc._rev
    }));
  } catch (error) {
    console.error('Error getting speakers:', error);
    throw error;
  }
};

// Action Items Operations
export const saveActionItem = async (actionItem: ActionItem): Promise<ActionItem> => {
  try {
    const now = new Date().toISOString();
    const newActionItem: ActionItem = {
      ...actionItem,
      _id: actionItem._id || `action_${now}_${actionItem.id}`,
      type: 'actionItem'
    };
    const response = await actionItemsDb.put(newActionItem);
    return { ...newActionItem, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving action item:', error);
    throw error;
  }
};

export const toggleActionItem = async (id: string, completed: boolean): Promise<ActionItem> => {
  try {
    const actionItem = await actionItemsDb.get(id);
    const now = new Date().toISOString();
    
    const updatedActionItem = {
      ...actionItem,
      completed,
      completedAt: completed ? now : undefined
    };
    
    const response = await actionItemsDb.put(updatedActionItem);
    return { ...updatedActionItem, _rev: response.rev };
  } catch (error) {
    console.error('Error toggling action item:', error);
    throw error;
  }
};

export const getActionItems = async (meetingId: string): Promise<ActionItem[]> => {
  try {
    const result = await actionItemsDb.find({
      selector: {
        meetingId,
        type: 'actionItem'
      }
    });
    return result.docs;
  } catch (error) {
    console.error('Error getting action items:', error);
    throw error;
  }
};

export const deleteActionItems = async (meetingId: string): Promise<boolean> => {
  try {
    const result = await actionItemsDb.find({
      selector: {
        meetingId,
        type: 'actionItem'
      }
    });
    
    await actionItemsDb.bulkDocs(
      result.docs.map(doc => ({
        ...doc,
        _deleted: true
      }))
    );
    
    return true;
  } catch (error) {
    console.error('Error deleting action items:', error);
    throw error;
  }
};

// Notes Operations
export const saveNotes = async (notes: Notes): Promise<Notes> => {
  try {
    const now = new Date().toISOString();
    const newNotes: Notes = {
      ...notes,
      _id: notes._id || `notes_${notes.meetingId}`,
      updatedAt: now,
      type: 'notes'
    };
    
    // Check if notes already exist for this meeting
    try {
      const existingNotes = await notesDb.get(newNotes._id);
      newNotes._rev = existingNotes._rev; // Use existing revision for update
    } catch (error) {
      // Notes don't exist yet, creating new
    }
    
    const response = await notesDb.put(newNotes);
    return { ...newNotes, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving notes:', error);
    throw error;
  }
};

export const getNotes = async (meetingId: string): Promise<Notes | null> => {
  try {
    return await notesDb.get(`notes_${meetingId}`);
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    console.error('Error getting notes:', error);
    throw error;
  }
};

export const deleteNotes = async (meetingId: string): Promise<boolean> => {
  try {
    try {
      const notes = await notesDb.get(`notes_${meetingId}`);
      await notesDb.remove(notes);
    } catch (error) {
      if ((error as any).status !== 404) {
        throw error;
      }
      // Notes don't exist, nothing to delete
    }
    return true;
  } catch (error) {
    console.error('Error deleting notes:', error);
    throw error;
  }
};

// Context Operations
export const saveContext = async (context: Context): Promise<Context> => {
  try {
    const newContext: Context = {
      ...context,
      _id: context._id || `context_${context.meetingId}`,
      type: 'context'
    };
    
    // Check if context already exists for this meeting
    try {
      const existingContext = await contextsDb.get(newContext._id);
      newContext._rev = existingContext._rev; // Use existing revision for update
    } catch (error) {
      // Context doesn't exist yet, creating new
    }
    
    const response = await contextsDb.put(newContext);
    return { ...newContext, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving context:', error);
    throw error;
  }
};

export const getContext = async (meetingId: string): Promise<Context | null> => {
  try {
    return await contextsDb.get(`context_${meetingId}`);
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    console.error('Error getting context:', error);
    throw error;
  }
};

export const deleteContext = async (meetingId: string): Promise<boolean> => {
  try {
    try {
      const context = await contextsDb.get(`context_${meetingId}`);
      await contextsDb.remove(context);
    } catch (error) {
      if ((error as any).status !== 404) {
        throw error;
      }
      // Context doesn't exist, nothing to delete
    }
    return true;
  } catch (error) {
    console.error('Error deleting context:', error);
    throw error;
  }
};

// Get complete meeting details
export const getMeetingDetails = async (meetingId: string): Promise<MeetingDetails | null> => {
  try {
    const meeting = await getMeeting(meetingId);
    if (!meeting) {
      return null;
    }
    
    const [transcript, speakers, actionItems, notes, context] = await Promise.all([
      getTranscript(meetingId),
      getSpeakers(meetingId),
      getActionItems(meetingId),
      getNotes(meetingId),
      getContext(meetingId)
    ]);
    
    return {
      meeting,
      transcript: transcript || [],
      speakers: speakers || [],
      actionItems: actionItems || [],
      notes: notes || { meetingId, content: '', type: 'notes', updatedAt: new Date().toISOString() },
      context: context || { meetingId, name: '', files: [], overrideGlobal: false, type: 'context' }
    };
  } catch (error) {
    console.error('Error getting meeting details:', error);
    throw error;
  }
};

// Add this helper function to check database initialization
const ensureDatabaseInitialized = async () => {
  if (!meetingsDb || !settingsDb) {
    console.log('Database not initialized yet, initializing now...');
    await setupDatabases();
    return true;
  }
  return false;
};

// Settings Operations
export const saveSettings = async (settings: UserSettings): Promise<UserSettings> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    if (!settingsDb) {
      throw new Error("Settings database is not available even after initialization attempt");
    }
    
    const settingsId = 'user_settings';
    const now = new Date().toISOString();
    let newSettings: UserSettings = {
      ...settings,
      _id: settingsId,
      updatedAt: now,
      type: 'settings'
    };
    
    // Check if settings already exist
    try {
      const existingSettings = await settingsDb.get(settingsId);
      newSettings._rev = existingSettings._rev; // Use existing revision for update
    } catch (error) {
      // Settings don't exist yet, creating new
      console.log('Creating new settings document');
    }
    
    const response = await settingsDb.put(newSettings);
    return { ...newSettings, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
};

export const getSettings = async (): Promise<UserSettings | null> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    if (!settingsDb) {
      throw new Error("Settings database is not available even after initialization attempt");
    }
    
    const settingsId = 'user_settings';
    return await settingsDb.get(settingsId);
  } catch (error) {
    if ((error as any).status === 404) {
      // Settings not found, return default settings
      return null;
    }
    console.error('Error getting settings:', error);
    throw error;
  }
};

// Global Context Operations
export const getGlobalContext = async (): Promise<GlobalContext | null> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    if (!globalContextDb) {
      throw new Error("Global context database is not available even after initialization attempt");
    }
    
    const globalContextId = 'global_context';
    return await globalContextDb.get(globalContextId);
  } catch (error) {
    if ((error as any).status === 404) {
      // Global context not found, create default
      const defaultGlobalContext: GlobalContext = {
        _id: 'global_context',
        name: 'Default Context',
        description: 'Global context used for all recordings by default',
        files: [],
        updatedAt: new Date().toISOString(),
        type: 'globalContext'
      };
      
      try {
        const result = await saveGlobalContext(defaultGlobalContext);
        return result;
      } catch (saveError) {
        console.error('Error creating default global context:', saveError);
        return null;
      }
    }
    console.error('Error getting global context:', error);
    throw error;
  }
};

export const saveGlobalContext = async (globalContext: GlobalContext): Promise<GlobalContext> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    if (!globalContextDb) {
      throw new Error("Global context database is not available even after initialization attempt");
    }
    
    const globalContextId = 'global_context';
    const now = new Date().toISOString();
    let newGlobalContext: GlobalContext = {
      ...globalContext,
      _id: globalContextId,
      updatedAt: now,
      type: 'globalContext'
    };
    
    // Check if global context already exists
    try {
      const existingGlobalContext = await globalContextDb.get(globalContextId);
      newGlobalContext._rev = existingGlobalContext._rev; // Use existing revision for update
    } catch (error) {
      // Global context doesn't exist yet, creating new
      console.log('Creating new global context document');
    }
    
    const response = await globalContextDb.put(newGlobalContext);
    return { ...newGlobalContext, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving global context:', error);
    throw error;
  }
};

// Context Files Operations
export const saveContextFile = async (contextFile: ContextFile): Promise<ContextFile> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    if (!contextFilesDb) {
      throw new Error("Context files database is not available even after initialization attempt");
    }
    
    const now = new Date().toISOString();
    let newContextFile: ContextFile = {
      ...contextFile,
      _id: contextFile._id || `context_file_${contextFile.id}`,
      addedAt: contextFile.addedAt || now,
      updatedAt: now,
      dbType: 'contextFile'
    };
    
    // Check if context file already exists
    if (contextFile._id) {
      try {
        const existingContextFile = await contextFilesDb.get(contextFile._id);
        newContextFile._rev = existingContextFile._rev; // Use existing revision for update
      } catch (error) {
        // Context file doesn't exist yet with this ID
      }
    }
    
    const response = await contextFilesDb.put(newContextFile);
    return { ...newContextFile, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving context file:', error);
    throw error;
  }
};

export const getContextFile = async (id: string): Promise<ContextFile | null> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    if (!contextFilesDb) {
      throw new Error("Context files database is not available even after initialization attempt");
    }
    
    return await contextFilesDb.get(`context_file_${id}`);
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    console.error('Error getting context file:', error);
    throw error;
  }
};

export const getAllContextFiles = async (): Promise<ContextFile[]> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    if (!contextFilesDb) {
      throw new Error("Context files database is not available even after initialization attempt");
    }
    
    const result = await contextFilesDb.find({
      selector: {
        dbType: 'contextFile'
      },
      sort: [{ addedAt: 'desc' }]
    });
    
    return result.docs;
  } catch (error) {
    console.error('Error getting all context files:', error);
    throw error;
  }
};

export const deleteContextFile = async (id: string): Promise<boolean> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    if (!contextFilesDb) {
      throw new Error("Context files database is not available even after initialization attempt");
    }
    
    try {
      // First get the file
      const fileId = id.startsWith('context_file_') ? id : `context_file_${id}`;
      const contextFile = await contextFilesDb.get(fileId);
      
      // Remove the file from global context if it's there
      const globalContext = await getGlobalContext();
      if (globalContext && globalContext.files.includes(id)) {
        globalContext.files = globalContext.files.filter(fileId => fileId !== id);
        await saveGlobalContext(globalContext);
      }
      
      // Then delete the file itself
      await contextFilesDb.remove(contextFile);
      
      return true;
    } catch (error) {
      if ((error as any).status !== 404) {
        throw error;
      }
      console.log('Context file not found, nothing to delete');
      return false;
    }
  } catch (error) {
    console.error('Error deleting context file:', error);
    throw error;
  }
};

export const addFileToGlobalContext = async (fileId: string): Promise<GlobalContext> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    // Get the global context
    let globalContext = await getGlobalContext();
    if (!globalContext) {
      throw new Error("Failed to get or create global context");
    }
    
    // Check if file is already in the global context
    if (!globalContext.files.includes(fileId)) {
      // Add the file ID to global context
      globalContext.files.push(fileId);
      
      // Save the updated global context
      globalContext = await saveGlobalContext(globalContext);
    }
    
    return globalContext;
  } catch (error) {
    console.error('Error adding file to global context:', error);
    throw error;
  }
};

export const removeFileFromGlobalContext = async (fileId: string): Promise<GlobalContext> => {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized();
    
    // Get the global context
    let globalContext = await getGlobalContext();
    if (!globalContext) {
      throw new Error("Failed to get or create global context");
    }
    
    // Remove the file ID from global context
    globalContext.files = globalContext.files.filter(id => id !== fileId);
    
    // Save the updated global context
    globalContext = await saveGlobalContext(globalContext);
    
    return globalContext;
  } catch (error) {
    console.error('Error removing file from global context:', error);
    throw error;
  }
};

// Export all database functions
export const DatabaseService = {
  initDatabase,
  createMeeting,
  getMeeting,
  updateMeeting,
  deleteMeeting,
  getAllMeetings,
  getMeetingsList,
  saveTranscript,
  getTranscript,
  deleteTranscript,
  saveSpeakers,
  getSpeakers,
  saveActionItem,
  toggleActionItem,
  getActionItems,
  deleteActionItems,
  saveNotes,
  getNotes,
  deleteNotes,
  saveContext,
  getContext,
  deleteContext,
  getMeetingDetails,
  saveSettings,
  getSettings,
  getGlobalContext,
  saveGlobalContext,
  saveContextFile,
  getContextFile,
  getAllContextFiles,
  deleteContextFile,
  addFileToGlobalContext,
  removeFileFromGlobalContext
}; 