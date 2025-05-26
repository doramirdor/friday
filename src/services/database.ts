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

// Singleton flag to track initialization status
let isInitialized = localStorage.getItem('db_initialized') === 'true';
let isInitializing = false;
let initializationPromise: Promise<boolean> | null = null;
let databasesInitialized = localStorage.getItem('databases_initialized') === 'true';

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
const setupDatabases = async (retryCount = 3) => {
  // Check if already initialized
  if (databasesInitialized && meetingsDb) {
    console.log('Database instances already created, skipping setup');
    return;
  }
  
  console.log('Setting up database instances...');
  
  const createWithRetry = async (name: string, attempts = 0) => {
    try {
      return await createDatabase(name);
    } catch (error) {
      if (attempts < retryCount) {
        console.warn(`Retrying database creation for ${name}, attempt ${attempts + 1}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return createWithRetry(name, attempts + 1);
      }
      throw error;
    }
  };
  
  try {
    // Create database instances for different data types with retry
    const dbSetups = [
      { name: 'meetings', setter: (db: any) => { meetingsDb = db; } },
      { name: 'transcripts', setter: (db: any) => { transcriptsDb = db; } },
      { name: 'speakers', setter: (db: any) => { speakersDb = db; } },
      { name: 'action-items', setter: (db: any) => { actionItemsDb = db; } },
      { name: 'notes', setter: (db: any) => { notesDb = db; } },
      { name: 'contexts', setter: (db: any) => { contextsDb = db; } },
      { name: 'settings', setter: (db: any) => { settingsDb = db; } },
      { name: 'context-files', setter: (db: any) => { contextFilesDb = db; } },
      { name: 'global-context', setter: (db: any) => { globalContextDb = db; } }
    ];

    // Create databases sequentially to avoid race conditions
    for (const { name, setter } of dbSetups) {
      const db = await createWithRetry(name);
      setter(db);
    }
    
    databasesInitialized = true;
    localStorage.setItem('databases_initialized', 'true');
    console.log('Database instances created successfully');
  } catch (error) {
    console.error('Error setting up database instances:', error);
    databasesInitialized = false;
    localStorage.removeItem('databases_initialized');
    throw error;
  }
};

// Create indexes for efficient querying
const setupIndexes = async () => {
  try {
    console.log('Setting up database indexes...');
    // Make sure databases are initialized
    if (!meetingsDb) {
      await setupDatabases();
    }
    
    // Meeting indexes - create a simpler index first
    const meetingsIndex = await meetingsDb.createIndex({
      index: {
        fields: ['type'],
        name: 'type-index',
        ddoc: 'type-index'
      }
    });
    console.log('Created meetings type index:', meetingsIndex);

    // Create the compound index after
    const meetingsCompoundIndex = await meetingsDb.createIndex({
      index: {
        fields: ['type', 'createdAt'],
        name: 'type-createdAt-index',
        ddoc: 'type-createdAt-index'
      }
    });
    console.log('Created meetings compound index:', meetingsCompoundIndex);

    // Wait for indexes to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify indexes
    const indexes = await meetingsDb.getIndexes();
    console.log('Available indexes:', indexes);

    // Other indexes remain the same...
    await actionItemsDb.createIndex({
      index: {
        fields: ['type', 'meetingId'],
        name: 'type-meetingId-index',
        ddoc: 'type-meetingId-index'
      }
    });

    await actionItemsDb.createIndex({
      index: {
        fields: ['type', 'meetingId', 'completed'],
        name: 'type-meetingId-completed-index',
        ddoc: 'type-meetingId-completed-index'
      }
    });

    await notesDb.createIndex({
      index: {
        fields: ['type', 'meetingId'],
        name: 'type-meetingId-index',
        ddoc: 'type-meetingId-index'
      }
    });

    await contextsDb.createIndex({
      index: {
        fields: ['type', 'meetingId'],
        name: 'type-meetingId-index',
        ddoc: 'type-meetingId-index'
      }
    });

    await contextFilesDb.createIndex({
      index: {
        fields: ['type', 'createdAt'],
        name: 'type-createdAt-index',
        ddoc: 'type-createdAt-index'
      }
    });

    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating database indexes:', error);
    throw error;
  }
};

// Initialize the database
const initDatabase = async () => {
  // If already initialized, return immediately
  if (isInitialized && databasesInitialized) {
    console.log('Database already initialized, skipping initialization');
    return true;
  }
  
  // If initialization is in progress, return the existing promise
  if (isInitializing && initializationPromise) {
    console.log('Database initialization already in progress, returning existing promise');
    return initializationPromise;
  }
  
  // Set flag and create promise
  isInitializing = true;
  initializationPromise = (async () => {
    try {
      console.log('Initializing database...');
      
      // First, check for and fix any PouchDB version compatibility issues
      await checkAndUpgradePouchDB();
      console.log('DOR Debug - After checkAndUpgradePouchDB databasesInitialized:', databasesInitialized);
      
      // Set up database instances if not already set up
      if (!databasesInitialized) {
        console.log('DOR Debug - Before setupDatabases');
        await setupDatabases();
        databasesInitialized = true;
        localStorage.setItem('databases_initialized', 'true');
      }
      
      // Then set up database indexes
      await setupIndexes();
      
      // Verify all databases are working
      await Promise.all([
        meetingsDb.info(),
        transcriptsDb.info(),
        speakersDb.info(),
        actionItemsDb.info(),
        notesDb.info(),
        contextsDb.info(),
        settingsDb.info(),
        contextFilesDb.info(),
        globalContextDb.info()
      ]);
      
      // Set initialized flags before returning
      isInitialized = true;
      localStorage.setItem('db_initialized', 'true');
      console.log('Database initialized successfully');
      
      return true;
    } catch (error) {
      console.error('Error initializing database:', error);
      // Reset flags on error
      isInitializing = false;
      isInitialized = false;
      databasesInitialized = false;
      localStorage.removeItem('db_initialized');
      localStorage.removeItem('databases_initialized');
      initializationPromise = null;
      // Re-throw to allow the error to be handled by the caller
      throw error;
    } finally {
      isInitializing = false;
    }
  })();
  
  return initializationPromise;
};

// Ensure database is initialized
const ensureDatabaseInitialized = async () => {
  // If everything is initialized, return immediately
  if (isInitialized && databasesInitialized && meetingsDb) {
    return;
  }
  
  // Initialize if not already initialized
  if (!isInitialized || !databasesInitialized) {
    await initDatabase();
    return;
  }
  
  // If databases aren't available but we're marked as initialized,
  // something went wrong - reinitialize
  if (!meetingsDb || !transcriptsDb || !speakersDb || !actionItemsDb || 
      !notesDb || !contextsDb || !settingsDb || !contextFilesDb || !globalContextDb) {
    console.log('Database instances not found, reinitializing...');
    isInitialized = false;
    databasesInitialized = false;
    localStorage.removeItem('db_initialized');
    localStorage.removeItem('databases_initialized');
    await initDatabase();
  }
};

// Helper function to handle document conflicts
const handleConflicts = async <T extends { _id?: string, _rev?: string }>(
  db: any,
  doc: T,
  maxRetries = 3
): Promise<T> => {
  let currentDoc = { ...doc };
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      // If we have an _id but no _rev, try to get the latest version
      if (currentDoc._id && !currentDoc._rev) {
        try {
          const existing = await db.get(currentDoc._id);
          currentDoc._rev = existing._rev;
        } catch (err: any) {
          if (err.status !== 404) throw err;
          // If 404, proceed with creation
        }
      }

      const response = await db.put(currentDoc);
      return { ...currentDoc, _rev: response.rev };
    } catch (err: any) {
      if (err.status === 409) {
        // On conflict, get the latest version and try again
        try {
          const latest = await db.get(currentDoc._id!);
          currentDoc = { ...latest, ...currentDoc, _rev: latest._rev };
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 100 * attempts)); // Exponential backoff
          continue;
        } catch (getErr) {
          console.error('Error getting latest version during conflict resolution:', getErr);
          throw getErr;
        }
      }
      throw err;
    }
  }
  throw new Error(`Failed to save document after ${maxRetries} attempts`);
};

// Meeting CRUD Operations
const createMeeting = async (meeting: Meeting): Promise<Meeting> => {
  try {
    await ensureDatabaseInitialized();
    
    const now = new Date().toISOString();
    // Generate a more robust unique ID if one isn't provided
    const uniqueId = meeting._id || `meeting_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const docToSave: Meeting = {
      ...meeting,
      _id: uniqueId,
      createdAt: meeting.createdAt || now,
      updatedAt: now,
      type: 'meeting'
    };

    return await handleConflicts(meetingsDb, docToSave);
  } catch (error) {
    console.error('Error creating meeting:', error);
    throw error;
  }
};

const getMeeting = async (id: string): Promise<Meeting | null> => {
  try {
    await ensureDatabaseInitialized();
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
    await ensureDatabaseInitialized();
    
    if (!meeting._id) {
      throw new Error('Meeting ID is required for update');
    }

    const docToSave: Meeting = {
      ...meeting,
      updatedAt: new Date().toISOString()
    };

    return await handleConflicts(meetingsDb, docToSave);
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
    await ensureDatabaseInitialized();
    
    // Try different query approaches in sequence
    try {
      // First try with simple type index
      const result = await meetingsDb.find({
        selector: {
          type: 'meeting'
        },
        use_index: 'type-index'
      });

      // Sort in memory if needed
      const sortedDocs = result.docs.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return sortedDocs;
    } catch (simpleIndexError) {
      console.warn('Simple index query failed, trying compound index:', simpleIndexError);
      
      try {
        // Try with compound index
        const result = await meetingsDb.find({
          selector: {
            type: 'meeting',
            createdAt: { $gt: null }
          },
          sort: [{ createdAt: 'desc' }],
          use_index: 'type-createdAt-index'
        });
        return result.docs;
      } catch (compoundIndexError) {
        console.warn('Compound index query failed, falling back to allDocs:', compoundIndexError);
        
        // Final fallback to allDocs
        const result = await meetingsDb.allDocs({
          include_docs: true,
          startkey: 'meeting_',
          endkey: 'meeting_\ufff0'
        });
        
        return result.rows
          .map(row => row.doc)
          .filter(doc => doc && doc.type === 'meeting')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    }
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
    await ensureDatabaseInitialized();
    
    // First delete existing transcript lines for this meeting
    const existingTranscript = await transcriptsDb.find({
      selector: {
        meetingId,
        type: 'transcript'
      }
    });
    
    for (const doc of existingTranscript.docs) {
      await transcriptsDb.remove(doc);
    }
    
    // Then add the new ones
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
    const now = new Date().toISOString();
    const docToSave: ActionItem = {
      ...actionItem,
      _id: actionItem._id || `action_${actionItem.meetingId}_${actionItem.id}`,
      updatedAt: now,
      type: 'actionItem'
    };

    return await handleConflicts(actionItemsDb, docToSave);
  } catch (error) {
    console.error('Error saving action item:', error);
    throw error;
  }
};

const saveActionItems = async (meetingId: string, actionItems: ActionItem[]): Promise<boolean> => {
  try {
    await ensureDatabaseInitialized();
    
    // First delete existing action items for this meeting
    const existingActionItems = await actionItemsDb.find({
      selector: {
        meetingId,
        type: 'actionItem'
      }
    });
    
    for (const doc of existingActionItems.docs) {
      await actionItemsDb.remove(doc);
    }
    
    // Then add the new ones
    if (actionItems.length > 0) {
      await actionItemsDb.bulkDocs(
        actionItems.map(item => ({
          ...item,
          _id: `action_${meetingId}_${item.id}`,
          meetingId,
          type: 'actionItem',
          updatedAt: new Date().toISOString()
        }))
      );
    }
    
    return true;
  } catch (error) {
    console.error('Error saving action items:', error);
    throw error;
  }
};

const toggleActionItem = async (id: string, completed: boolean): Promise<ActionItem> => {
  try {
    await ensureDatabaseInitialized();
    
    const doc = await actionItemsDb.get(id);
    const updatedDoc = {
      ...doc,
      completed,
      updatedAt: new Date().toISOString()
    };

    return await handleConflicts(actionItemsDb, updatedDoc);
  } catch (error) {
    console.error('Error toggling action item:', error);
    throw error;
  }
};

const getActionItems = async (meetingId: string): Promise<ActionItem[]> => {
  try {
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
    const now = new Date().toISOString();
    let contextDoc: Context;
    
    // Check if context already exists for this meeting
    try {
      contextDoc = await contextsDb.get(`context_${context.meetingId}`);
      contextDoc = {
        ...contextDoc,
        name: context.name,
        content: context.content,
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
    await ensureDatabaseInitialized();
    
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
    await ensureDatabaseInitialized();
    
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

// Settings Operations
const saveSettings = async (settings: UserSettings): Promise<UserSettings> => {
  try {
    await ensureDatabaseInitialized();
    
    const now = new Date().toISOString();
    let retries = 3;
    let lastError;
    
    while (retries > 0) {
      try {
        // Get current settings
        let currentSettings: UserSettings | null = null;
        try {
          currentSettings = await settingsDb.get('settings');
        } catch (error: any) {
          if (error.status !== 404) {
            throw error;
          }
        }

        // Prepare new settings document
        const newSettings: UserSettings = {
          _id: 'settings',
          ...currentSettings,
          ...settings,
          updatedAt: now,
          type: 'settings'
        };

        // If we have current settings, use its _rev
        if (currentSettings?._rev) {
          newSettings._rev = currentSettings._rev;
        }

        // Try to save
        const response = await settingsDb.put(newSettings);
        return { ...newSettings, _rev: response.rev };
      } catch (error: any) {
        lastError = error;
        if (error.status === 409 && retries > 1) {
          // Conflict error, retry after a delay
          console.log('Settings update conflict, retrying...');
          retries--;
          await new Promise(resolve => setTimeout(resolve, 500)); // Longer delay
          continue;
        }
        throw error;
      }
    }
    
    throw lastError || new Error('Failed to save settings after retries');
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
};

const getSettings = async (): Promise<UserSettings | null> => {
  try {
    await ensureDatabaseInitialized();
    
    try {
      return await settingsDb.get('settings');
    } catch (error: any) {
      if (error.status === 404) {
        // Create default settings if they don't exist
        const defaultSettings: UserSettings = {
          _id: 'settings',
          liveTranscript: true,
          theme: 'light',
          autoLaunch: false,
          recordingSource: 'system',
          isVolumeBoostEnabled: false,
          volumeLevel: 1.0,
          updatedAt: new Date().toISOString(),
          type: 'settings'
        };
        
        try {
          const response = await settingsDb.put(defaultSettings);
          return { ...defaultSettings, _rev: response.rev };
        } catch (putError: any) {
          if (putError.status === 409) {
            // If we got a conflict, someone else created the settings
            // Try to get them again
            return await settingsDb.get('settings');
          }
          throw putError;
        }
      }
      throw error;
    }
  } catch (error) {
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
          description: 'Default global context for all meetings',
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

// Bulk save helper
const bulkSave = async <T extends { _id?: string, _rev?: string }>(
  db: any,
  docs: T[],
  options: { new_edits?: boolean } = { new_edits: true }
): Promise<T[]> => {
  try {
    // Get all existing docs first
    const existingDocs = await Promise.all(
      docs
        .filter(doc => doc._id)
        .map(doc => db.get(doc._id).catch(() => null))
    );

    // Merge with existing revisions
    const docsToSave = docs.map((doc, i) => {
      const existing = existingDocs[i];
      if (existing) {
        return { ...doc, _rev: existing._rev };
      }
      return doc;
    });

    const result = await db.bulkDocs(docsToSave, options);
    
    // Check for errors
    const errors = result.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Bulk save errors:', errors);
      throw new Error(`Failed to save ${errors.length} documents`);
    }

    // Return updated docs with new revisions
    return docsToSave.map((doc, i) => ({
      ...doc,
      _rev: result[i].rev
    }));
  } catch (error) {
    console.error('Error in bulk save:', error);
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
  saveActionItems,
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
  removeFileFromGlobalContext,
  bulkSave,
  handleConflicts
}; 