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
    console.log('Setting up database indexes...');
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
const initDatabase = async () => {
  try {
    console.log('Initializing database...');
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
const createMeeting = async (meeting: Meeting): Promise<Meeting> => {
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

const getMeeting = async (id: string): Promise<Meeting | null> => {
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

const updateMeeting = async (meeting: Meeting): Promise<Meeting> => {
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

const deleteMeeting = async (id: string): Promise<boolean> => {
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

const getAllMeetings = async (): Promise<Meeting[]> => {
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

const getMeetingsList = async (): Promise<RecordingListItem[]> => {
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
const saveTranscript = async (meetingId: string, transcript: TranscriptLine[]): Promise<boolean> => {
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

const getTranscript = async (meetingId: string): Promise<TranscriptLine[]> => {
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

const deleteTranscript = async (meetingId: string): Promise<boolean> => {
  try {
    // Find all transcript lines for this meeting
    const result = await transcriptsDb.find({
      selector: {
        meetingId,
        type: 'transcript'
      }
    });
    
    // Delete each document
    for (const doc of result.docs) {
      await transcriptsDb.remove(doc);
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting transcript:', error);
    throw error;
  }
};

// Speaker Operations
const saveSpeakers = async (meetingId: string, speakers: Speaker[]): Promise<boolean> => {
  try {
    // First delete existing speakers for this meeting
    const existingSpeakers = await speakersDb.find({
      selector: {
        meetingId,
        type: 'speaker'
      }
    });
    
    for (const doc of existingSpeakers.docs) {
      await speakersDb.remove(doc);
    }
    
    // Then add the new ones
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

const getSpeakers = async (meetingId: string): Promise<Speaker[]> => {
  try {
    const result = await speakersDb.find({
      selector: {
        meetingId,
        type: 'speaker'
      }
    });
    
    return result.docs.map(doc => ({
      id: doc.id,
      name: doc.name,
      color: doc.color,
      meetingId: doc.meetingId,
      type: 'speaker'
    }));
  } catch (error) {
    console.error('Error getting speakers:', error);
    throw error;
  }
};

// Action Item Operations
const saveActionItem = async (actionItem: ActionItem): Promise<ActionItem> => {
  try {
    const now = new Date().toISOString();
    const newActionItem: ActionItem = {
      ...actionItem,
      _id: actionItem._id || `action_${actionItem.meetingId}_${actionItem.id}`,
      updatedAt: now,
      type: 'actionItem'
    };
    
    const response = await actionItemsDb.put(newActionItem);
    return { ...newActionItem, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving action item:', error);
    throw error;
  }
};

const toggleActionItem = async (id: string, completed: boolean): Promise<ActionItem> => {
  try {
    const actionItem = await actionItemsDb.get(id);
    
    if (!actionItem) {
      throw new Error(`Action item not found: ${id}`);
    }
    
    const updatedActionItem = {
      ...actionItem,
      completed,
      updatedAt: new Date().toISOString()
    };
    
    const response = await actionItemsDb.put(updatedActionItem);
    return { ...updatedActionItem, _rev: response.rev };
  } catch (error) {
    console.error('Error toggling action item:', error);
    throw error;
  }
};

const getActionItems = async (meetingId: string): Promise<ActionItem[]> => {
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

const deleteActionItems = async (meetingId: string): Promise<boolean> => {
  try {
    // Find all action items for this meeting
    const result = await actionItemsDb.find({
      selector: {
        meetingId,
        type: 'actionItem'
      }
    });
    
    // Delete each document
    for (const doc of result.docs) {
      await actionItemsDb.remove(doc);
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting action items:', error);
    throw error;
  }
};

// Notes Operations
const saveNotes = async (notes: Notes): Promise<Notes> => {
  try {
    const now = new Date().toISOString();
    let notesDoc: Notes;
    
    // Check if notes already exist for this meeting
    try {
      notesDoc = await notesDb.get(`notes_${notes.meetingId}`);
      notesDoc = {
        ...notesDoc,
        content: notes.content,
        updatedAt: now
      };
    } catch (error) {
      // Notes don't exist yet, create new
      notesDoc = {
        ...notes,
        _id: `notes_${notes.meetingId}`,
        updatedAt: now,
        type: 'notes'
      };
    }
    
    const response = await notesDb.put(notesDoc);
    return { ...notesDoc, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving notes:', error);
    throw error;
  }
};

const getNotes = async (meetingId: string): Promise<Notes | null> => {
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

const deleteNotes = async (meetingId: string): Promise<boolean> => {
  try {
    try {
      const doc = await notesDb.get(`notes_${meetingId}`);
      await notesDb.remove(doc);
    } catch (error) {
      // If notes don't exist, that's fine
      if ((error as any).status !== 404) {
        throw error;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting notes:', error);
    throw error;
  }
};

// Context Operations
const saveContext = async (context: Context): Promise<Context> => {
  try {
    const now = new Date().toISOString();
    let contextDoc: Context;
    
    // Check if context already exists for this meeting
    try {
      contextDoc = await contextsDb.get(`context_${context.meetingId}`);
      contextDoc = {
        ...contextDoc,
        name: context.name,
        files: context.files,
        overrideGlobal: context.overrideGlobal,
        updatedAt: now
      };
    } catch (error) {
      // Context doesn't exist yet, create new
      contextDoc = {
        ...context,
        _id: `context_${context.meetingId}`,
        updatedAt: now,
        type: 'context'
      };
    }
    
    const response = await contextsDb.put(contextDoc);
    return { ...contextDoc, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving context:', error);
    throw error;
  }
};

const getContext = async (meetingId: string): Promise<Context | null> => {
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

const deleteContext = async (meetingId: string): Promise<boolean> => {
  try {
    try {
      const doc = await contextsDb.get(`context_${meetingId}`);
      await contextsDb.remove(doc);
    } catch (error) {
      // If context doesn't exist, that's fine
      if ((error as any).status !== 404) {
        throw error;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting context:', error);
    throw error;
  }
};

// Get full meeting details
const getMeetingDetails = async (meetingId: string): Promise<MeetingDetails | null> => {
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
      transcript,
      speakers,
      actionItems,
      notes,
      context
    };
  } catch (error) {
    console.error('Error getting meeting details:', error);
    throw error;
  }
};

// Ensure database is initialized
const ensureDatabaseInitialized = async () => {
  if (!meetingsDb) {
    await setupDatabases();
    await setupIndexes();
  }
};

// Settings Operations
const saveSettings = async (settings: UserSettings): Promise<UserSettings> => {
  try {
    await ensureDatabaseInitialized();
    
    const now = new Date().toISOString();
    let settingsDoc: UserSettings;
    
    // Check if settings already exist
    try {
      settingsDoc = await settingsDb.get('settings');
      settingsDoc = {
        ...settingsDoc,
        ...settings,
        updatedAt: now
      };
    } catch (error) {
      // Settings don't exist yet, create new
      settingsDoc = {
        ...settings,
        _id: 'settings',
        updatedAt: now,
        type: 'settings'
      };
    }
    
    const response = await settingsDb.put(settingsDoc);
    return { ...settingsDoc, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
};

const getSettings = async (): Promise<UserSettings | null> => {
  try {
    await ensureDatabaseInitialized();
    
    return await settingsDb.get('settings');
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    console.error('Error getting settings:', error);
    throw error;
  }
};

// Global Context Operations
const getGlobalContext = async (): Promise<GlobalContext | null> => {
  try {
    await ensureDatabaseInitialized();
    
    let globalContext: GlobalContext;
    
    try {
      globalContext = await globalContextDb.get('global_context');
    } catch (error) {
      if ((error as any).status === 404) {
        // Create default global context
        globalContext = {
          _id: 'global_context',
          name: 'Global Context',
          files: [],
          updatedAt: new Date().toISOString(),
          type: 'globalContext'
        };
        
        const response = await globalContextDb.put(globalContext);
        globalContext._rev = response.rev;
      } else {
        throw error;
      }
    }
    
    return globalContext;
  } catch (error) {
    console.error('Error getting global context:', error);
    throw error;
  }
};

const saveGlobalContext = async (globalContext: GlobalContext): Promise<GlobalContext> => {
  try {
    await ensureDatabaseInitialized();
    
    const now = new Date().toISOString();
    let contextDoc: GlobalContext;
    
    // Check if global context already exists
    try {
      contextDoc = await globalContextDb.get('global_context');
      contextDoc = {
        ...contextDoc,
        name: globalContext.name,
        files: globalContext.files,
        updatedAt: now
      };
    } catch (error) {
      // Global context doesn't exist yet, create new
      contextDoc = {
        ...globalContext,
        _id: 'global_context',
        updatedAt: now,
        type: 'globalContext'
      };
    }
    
    const response = await globalContextDb.put(contextDoc);
    return { ...contextDoc, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving global context:', error);
    throw error;
  }
};

// Context Files Operations
const saveContextFile = async (contextFile: ContextFile): Promise<ContextFile> => {
  try {
    await ensureDatabaseInitialized();
    
    const now = new Date().toISOString();
    const fileDoc: ContextFile = {
      ...contextFile,
      _id: contextFile._id || `file_${now}`,
      createdAt: contextFile.createdAt || now,
      updatedAt: now,
      type: 'contextFile'
    };
    
    const response = await contextFilesDb.put(fileDoc);
    return { ...fileDoc, _id: response.id, _rev: response.rev };
  } catch (error) {
    console.error('Error saving context file:', error);
    throw error;
  }
};

const getContextFile = async (id: string): Promise<ContextFile | null> => {
  try {
    await ensureDatabaseInitialized();
    
    return await contextFilesDb.get(id);
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    console.error('Error getting context file:', error);
    throw error;
  }
};

const getAllContextFiles = async (): Promise<ContextFile[]> => {
  try {
    await ensureDatabaseInitialized();
    
    const result = await contextFilesDb.find({
      selector: {
        type: 'contextFile'
      },
      sort: [{ createdAt: 'desc' }]
    });
    
    return result.docs;
  } catch (error) {
    console.error('Error getting all context files:', error);
    throw error;
  }
};

const deleteContextFile = async (id: string): Promise<boolean> => {
  try {
    await ensureDatabaseInitialized();
    
    const doc = await contextFilesDb.get(id);
    await contextFilesDb.remove(doc);
    
    // Also remove from global context if it exists there
    const globalContext = await getGlobalContext();
    if (globalContext && globalContext.files.includes(id)) {
      globalContext.files = globalContext.files.filter(fileId => fileId !== id);
      await saveGlobalContext(globalContext);
    }
    
    // Remove from any meeting contexts as well
    const contexts = await contextsDb.find({
      selector: {
        type: 'context',
        files: { $elemMatch: { $eq: id } }
      }
    });
    
    for (const context of contexts.docs) {
      context.files = context.files.filter((fileId: string) => fileId !== id);
      await contextsDb.put(context);
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting context file:', error);
    throw error;
  }
};

// Helper functions for global context
const addFileToGlobalContext = async (fileId: string): Promise<GlobalContext> => {
  try {
    await ensureDatabaseInitialized();
    
    const globalContext = await getGlobalContext();
    if (!globalContext) {
      throw new Error('Global context not found');
    }
    
    // Check if file exists
    const file = await getContextFile(fileId);
    if (!file) {
      throw new Error(`Context file not found: ${fileId}`);
    }
    
    // Add file if not already in the list
    if (!globalContext.files.includes(fileId)) {
      globalContext.files.push(fileId);
      return await saveGlobalContext(globalContext);
    }
    
    return globalContext;
  } catch (error) {
    console.error('Error adding file to global context:', error);
    throw error;
  }
};

const removeFileFromGlobalContext = async (fileId: string): Promise<GlobalContext> => {
  try {
    await ensureDatabaseInitialized();
    
    const globalContext = await getGlobalContext();
    if (!globalContext) {
      throw new Error('Global context not found');
    }
    
    // Remove file if it exists in the list
    if (globalContext.files.includes(fileId)) {
      globalContext.files = globalContext.files.filter(id => id !== fileId);
      return await saveGlobalContext(globalContext);
    }
    
    return globalContext;
  } catch (error) {
    console.error('Error removing file from global context:', error);
    throw error;
  }
};

// Export as a namespaced service
export const DatabaseService = {
  initDatabase,
  
  // Meeting operations
  createMeeting,
  getMeeting,
  updateMeeting,
  deleteMeeting,
  getAllMeetings,
  getMeetingsList,
  
  // Transcript operations
  saveTranscript,
  getTranscript,
  deleteTranscript,
  
  // Speaker operations
  saveSpeakers,
  getSpeakers,
  
  // Action item operations
  saveActionItem,
  toggleActionItem,
  getActionItems,
  deleteActionItems,
  
  // Notes operations
  saveNotes,
  getNotes,
  deleteNotes,
  
  // Context operations
  saveContext,
  getContext,
  deleteContext,
  
  // Meeting details
  getMeetingDetails,
  
  // Settings operations
  saveSettings,
  getSettings,
  
  // Global context operations
  getGlobalContext,
  saveGlobalContext,
  
  // Context files operations
  saveContextFile,
  getContextFile,
  getAllContextFiles,
  deleteContextFile,
  
  // Helper functions
  addFileToGlobalContext,
  removeFileFromGlobalContext
}; 