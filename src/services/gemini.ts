import { GoogleGenAI } from '@google/genai';
import { TranscriptLine, Speaker, Context, GlobalContext } from '@/models/types';
import { DatabaseService } from './database';

// Interface for decision made in the meeting
export interface Decision {
  decision: string;
  rationale: string;
  impact: string;
}

// Interface for action item from analysis
export interface AnalysisActionItem {
  task: string;
  owner: string;
  due_date: string;
  priority: 'High' | 'Med' | 'Low';
}

// Interface for Gemini analysis results
export interface MeetingAnalysis {
  title: string;
  description: string;
  notes: string;
  tags: string[];
  summary: string;
  decisions: Decision[];
  action_items: AnalysisActionItem[];
  risks: string[];
  open_questions: string[];
  sentiment: 'Positive' | 'Neutral' | 'Negative';
}

// Interface for Gemini transcription results
export interface GeminiTranscriptionResult {
  transcript: string;
  speakers: Speaker[];
}

// Interface for analysis input
interface AnalysisInput {
  transcript: TranscriptLine[];
  speakers: Speaker[];
  meetingContext?: Context;
  globalContext?: GlobalContext;
  currentTitle?: string;
  currentDescription?: string;
}

class GeminiService {
  private genAI: GoogleGenAI | null = null;

  constructor() {
    this.initializeGemini();
  }

  private async initializeGemini() {
    try {
      // Get API key from environment variable first (via electronAPI if available), then fall back to settings and localStorage
      const electronAPI = (window as { electronAPI?: { env?: { GEMINI_API_KEY?: string } } }).electronAPI;
      const envApiKey = electronAPI?.env?.GEMINI_API_KEY;
      const settingsApiKey = (await DatabaseService.getSettings())?.geminiApiKey;
      const localStorageApiKey = localStorage.getItem('gemini-api-key');
      
      const apiKey = envApiKey || settingsApiKey || localStorageApiKey;
      
      console.log('Gemini API key sources:', {
        envApiKey: envApiKey ? `${envApiKey.substring(0, 10)}...` : 'Not found',
        settingsApiKey: settingsApiKey ? `${settingsApiKey.substring(0, 10)}...` : 'Not found',
        localStorageApiKey: localStorageApiKey ? `${localStorageApiKey.substring(0, 10)}...` : 'Not found',
        finalApiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'Not found'
      });
      
      if (!apiKey) {
        console.warn('Gemini API key not found. AI features will be disabled.');
        return;
      }

      this.genAI = new GoogleGenAI({ apiKey });
      
      console.log('Gemini AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Gemini AI:', error);
    }
  }

  async reinitialize() {
    await this.initializeGemini();
  }

  isAvailable(): boolean {
    return this.genAI !== null;
  }

  private formatTranscriptForAI(transcript: TranscriptLine[], speakers: Speaker[]): string {
    if (!transcript || transcript.length === 0) {
      return "No transcript available.";
    }

    const speakerMap = new Map(speakers.map(s => [s.id, s.name]));
    
    return transcript
      .map(line => {
        const speakerName = speakerMap.get(line.speakerId) || `Speaker ${line.speakerId}`;
        return `${speakerName}: ${line.text}`;
      })
      .join('\n');
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code block markers if present
    let cleaned = text.trim();
    
    // Remove ```json at the beginning
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    
    // Remove ``` at the end
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    // Trim any remaining whitespace
    return cleaned.trim();
  }

  private buildContextPrompt(input: AnalysisInput): string {
    let contextPrompt = '';
    
    if (input.globalContext) {
      contextPrompt += `Global Context:\n${input.globalContext.description}\n\n`;
    }
    
    if (input.meetingContext && input.meetingContext.overrideGlobal) {
      contextPrompt += `Meeting-Specific Context:\n${input.meetingContext.content}\n\n`;
    }
    
    if (input.currentTitle) {
      contextPrompt += `Current Title: ${input.currentTitle}\n`;
    }
    
    if (input.currentDescription) {
      contextPrompt += `Current Description: ${input.currentDescription}\n`;
    }
    
    return contextPrompt;
  }

  async transcribeAudio(audioFile: string, maxSpeakers?: number): Promise<GeminiTranscriptionResult> {
    console.log('Starting Gemini audio transcription...', { audioFile, maxSpeakers });

    if (!this.isAvailable()) {
      throw new Error('Gemini AI is not initialized. Please check your API key.');
    }

    console.log('Processing audio file path:', audioFile);

    // Validate file path
    if (!audioFile || audioFile.trim() === '') {
      throw new Error('Audio file path is required');
    }

    let audioBuffer: ArrayBuffer;
    let mimeType: string;

    try {
      // Handle different URL formats
      if (audioFile.startsWith('data:')) {
        // Data URL
        console.log('Processing data URL...');
        const response = await fetch(audioFile);
        audioBuffer = await response.arrayBuffer();
        mimeType = response.headers.get('content-type') || 'audio/wav';
      } else if (audioFile.startsWith('blob:')) {
        // Blob URL
        console.log('Processing blob URL...');
        const response = await fetch(audioFile);
        audioBuffer = await response.arrayBuffer();
        mimeType = response.headers.get('content-type') || 'audio/wav';
      } else {
        // File path - use Electron API
        console.log('Reading audio file via Electron API:', audioFile);
        const readResult = await window.electronAPI.readAudioFile(audioFile);
        
        if (!readResult.success || !readResult.buffer) {
          throw new Error(`Failed to read audio file: ${readResult.error || 'Unknown error'}`);
        }

        audioBuffer = readResult.buffer;
        console.log('Audio file read successfully, size:', audioBuffer.byteLength);
        
        // Detect MIME type from file extension
        mimeType = this.detectAudioMimeType(audioFile);
        console.log('Detected MIME type:', mimeType);
      }

      if (!audioBuffer || audioBuffer.byteLength === 0) {
        throw new Error('Audio file is empty or could not be read');
      }

      // Check file size (Gemini has a 20MB limit)
      const fileSizeMB = audioBuffer.byteLength / (1024 * 1024);
      if (fileSizeMB > 20) {
        throw new Error(`Audio file is too large (${fileSizeMB.toFixed(1)}MB). Maximum size is 20MB.`);
      }

      console.log('Audio file uploaded to Gemini, generating transcription...');

      // Create timeout wrapper for Gemini API call
      const timeoutMs = 30000; // 30 seconds timeout
      const transcriptionPromise = this.performGeminiTranscription(audioBuffer, mimeType, maxSpeakers);
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Gemini API call timed out after ${timeoutMs/1000} seconds`));
        }, timeoutMs);
      });

      // Race between transcription and timeout
      const result = await Promise.race([transcriptionPromise, timeoutPromise]);
      
      console.log('Gemini transcription received:', result.transcript);

      return result;

    } catch (error) {
      console.error('Error transcribing audio with Gemini:', error);
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }

  private async performGeminiTranscription(
    audioBuffer: ArrayBuffer,
    mimeType: string,
    maxSpeakers?: number
  ): Promise<GeminiTranscriptionResult> {
    // Upload the audio file to Gemini
    const uploadedFile = await this.genAI.files.upload({
      file: new Blob([audioBuffer], { type: mimeType }),
      displayName: `audio-${Date.now()}`
    });

    console.log('Audio file uploaded successfully:', uploadedFile.name);

    try {
      // Generate content with the uploaded file
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' });
      
      const speakerInstruction = maxSpeakers && maxSpeakers > 1 
        ? `Identify and label speakers (up to ${maxSpeakers} speakers maximum). Use "Speaker 1:", "Speaker 2:", etc.`
        : 'Transcribe the audio without speaker labels.';

      const prompt = `Please transcribe this audio file with speaker diarization. ${speakerInstruction}

Format the output as JSON with this structure:
{
  "transcript": "Speaker 1: Hello there. Speaker 2: Hi, how are you?",
  "speakers": [
    {"id": "1", "name": "Speaker 1", "color": "#28C76F"},
    {"id": "2", "name": "Speaker 2", "color": "#FF6B6B"}
  ]
}

Important: Only identify actual distinct speakers present in the audio. If there's only one speaker, only include one speaker object.`;

      const result = await model.generateContent([
        {
          text: prompt
        },
        {
          fileData: {
            fileUri: uploadedFile.uri,
            mimeType: mimeType
          }
        }
      ]);

      const response = result.response;
      const responseText = response.text();
      
      console.log('Raw Gemini response:', responseText.substring(0, 200) + '...');

      // Clean and parse the JSON response
      const cleanedResponse = this.cleanJsonResponse(responseText);
      const transcriptionData = JSON.parse(cleanedResponse);

      // Validate the response structure
      if (!transcriptionData.transcript) {
        throw new Error('Invalid response: missing transcript');
      }

      // Clean up the uploaded file
      try {
        if (uploadedFile && uploadedFile.name) {
          console.log('🗑️ Cleaning up uploaded file:', uploadedFile.name);
          await this.genAI.files.delete({ name: uploadedFile.name });
          console.log('✅ File cleanup successful');
        } else {
          console.log('⚠️ No file to cleanup or file name missing');
        }
      } catch (cleanupError: any) {
        console.warn('⚠️ File cleanup failed (non-critical):', cleanupError.message || cleanupError);
        // Don't throw error for cleanup failures - transcription was successful
      }

      // Default speaker colors
      const speakerColors = ['#28C76F', '#7367F0', '#FF9F43', '#EA5455', '#00CFE8', '#9F44D3'];

      // Ensure speakers have required properties
      const speakers = (transcriptionData.speakers || []).map((speaker: any, index: number) => ({
        id: speaker.id || (index + 1).toString(),
        name: speaker.name || `Speaker ${index + 1}`,
        color: speaker.color || speakerColors[index % speakerColors.length],
        meetingId: 'live-unified-session',
        type: 'speaker' as const
      }));

      return {
        transcript: transcriptionData.transcript,
        speakers: speakers
      };

    } catch (error) {
      // Clean up the uploaded file even on error
      try {
        if (uploadedFile && uploadedFile.name) {
          console.log('🗑️ Cleaning up uploaded file after error:', uploadedFile.name);
          await this.genAI.files.delete({ name: uploadedFile.name });
        }
      } catch (cleanupError: any) {
        console.warn('⚠️ Error cleaning up file after transcription error (non-critical):', cleanupError.message || cleanupError);
      }
      
      throw error;
    }
  }

  async analyzeMeeting(input: AnalysisInput): Promise<MeetingAnalysis> {
    if (!this.genAI) {
      throw new Error('Gemini AI is not initialized. Please check your API key.');
    }

    try {
      const transcriptText = this.formatTranscriptForAI(input.transcript, input.speakers);
      const contextPrompt = this.buildContextPrompt(input);

      const prompt = `
      You are a senior meeting analyst AI that digests raw transcripts and produces
      executive-quality, action-oriented summaries.
      
      💡 **Think silently, step-by-step**, to spot themes, agreements, disagreements,
      risks, and next steps — but DO NOT reveal that internal reasoning.  
      Return **only** the final JSON that conforms to the schema below.
      
      ====================================================================
      MEETING CONTEXT
      --------------------------------------------------------------------
      ${contextPrompt}
      
      MEETING TRANSCRIPT
      --------------------------------------------------------------------
      ${transcriptText}
      
      ====================================================================
      RETURN JSON WITH THIS EXACT SHAPE
      {
        "title":         "Concise, specific headline – ≤60 chars",
        "description":   "1–2-sentence purpose of the meeting",
        "summary":       "4–8 sentence narrative of key discussion points",
        "decisions":     [
            { "decision": "What was decided", "rationale": "Why", "impact": "Expected effect" }
        ],
        "action_items":  [
            {
              "task":      "Actionable task phrased as a verb",
              "owner":     "Name (or ´Unassigned´ if unknown)",
              "due_date":  "YYYY-MM-DD or ´TBD´",
              "priority":  "High | Med | Low"
            }
        ],
        "risks":         ["Potential issues, blockers, unknowns"],
        "open_questions":["Questions that need follow-up"],
        "sentiment":     "Overall tone: Positive | Neutral | Negative",
        "tags":          ["3-8 searchable keywords"],
      - **Discussion Points**\n- **Insights**\n- **Decisions**\n- **Next Steps**\n\
      Include timestamps or speaker initials where helpful.",
        "notes":         "Structured meeting notes with sections for Discussion Points, Insights, Decisions, and Next Steps"
      }
      
      RULES
      1. Do not invent data; flag missing info with "TBD" or empty arrays.
      2. Keep arrays deduplicated and elements concise.
      3. Output valid JSON **only** – no markdown fences, comments, or extra text.
      `;

      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash-preview-05-20',
        contents: prompt
      });

      const text = result.text;

      // Parse the JSON response
      try {
        // Clean the response text to handle markdown code blocks
        const cleanedText = this.cleanJsonResponse(text);
        const analysis = JSON.parse(cleanedText);
        
        // Validate the response structure
        if (!analysis.title || !analysis.description || !Array.isArray(analysis.tags)) {
          throw new Error('Invalid response structure from Gemini');
        }

        return {
          title: analysis.title.substring(0, 100), // Ensure reasonable length
          description: analysis.description.substring(0, 500),
          notes: analysis.notes || 'No detailed notes available',
          tags: analysis.tags.slice(0, 10), // Limit to 10 tags
          summary: analysis.summary || analysis.notes?.substring(0, 300) + '...' || 'No summary available',
          decisions: Array.isArray(analysis.decisions) ? analysis.decisions : [],
          action_items: Array.isArray(analysis.action_items) ? analysis.action_items : [],
          risks: Array.isArray(analysis.risks) ? analysis.risks : [],
          open_questions: Array.isArray(analysis.open_questions) ? analysis.open_questions : [],
          sentiment: analysis.sentiment || 'Neutral'
        };
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', parseError);
        console.log('Raw response:', text);
        console.log('Cleaned response:', this.cleanJsonResponse(text));
        
        // Try one more time with additional cleaning
        try {
          const extraCleanedText = this.cleanJsonResponse(text)
            .replace(/^[^{]*/, '') // Remove everything before the first {
            .replace(/[^}]*$/, ''); // Remove everything after the last }
          
          if (extraCleanedText.startsWith('{') && extraCleanedText.endsWith('}')) {
            const analysis = JSON.parse(extraCleanedText);
            
            if (analysis.title || analysis.description || analysis.notes) {
              console.log('Successfully parsed with extra cleaning');
              return {
                title: analysis.title?.substring(0, 100) || 'Meeting Analysis',
                description: analysis.description?.substring(0, 500) || 'AI-generated meeting analysis',
                notes: analysis.notes || 'Analysis could not be completed',
                tags: Array.isArray(analysis.tags) ? analysis.tags.slice(0, 10) : ['meeting'],
                summary: analysis.summary || analysis.notes?.substring(0, 300) + '...' || 'Summary not available',
                decisions: Array.isArray(analysis.decisions) ? analysis.decisions : [],
                action_items: Array.isArray(analysis.action_items) ? analysis.action_items : [],
                risks: Array.isArray(analysis.risks) ? analysis.risks : [],
                open_questions: Array.isArray(analysis.open_questions) ? analysis.open_questions : [],
                sentiment: analysis.sentiment || 'Neutral'
              };
            }
          }
        } catch (secondParseError) {
          console.error('Second parsing attempt also failed:', secondParseError);
        }
        
        // Fallback: try to extract information manually
        return this.fallbackAnalysis(transcriptText);
      }
    } catch (error) {
      console.error('Error analyzing meeting with Gemini:', error);
      throw new Error(`Failed to analyze meeting: ${error.message}`);
    }
  }

  private fallbackAnalysis(transcriptText: string): MeetingAnalysis {
    // Simple fallback analysis when Gemini fails
    const wordCount = transcriptText.split(' ').length;
    const speakers = new Set(transcriptText.match(/^([^:]+):/gm)?.map(match => match.replace(':', '')) || []);
    
    return {
      title: `Meeting Discussion (${speakers.size} participants)`,
      description: `Meeting with ${speakers.size} participants discussing various topics (${wordCount} words transcribed).`,
      notes: `# Meeting Notes\n\n## Participants\n${Array.from(speakers).map(s => `- ${s}`).join('\n')}\n\n## Transcript\n${transcriptText}`,
      tags: ['meeting', 'discussion', 'transcript'],
      summary: `Meeting with ${speakers.size} participants. Full transcript available in notes.`,
      decisions: [],
      action_items: [],
      risks: [],
      open_questions: [],
      sentiment: 'Neutral'
    };
  }

  async testConnection(): Promise<boolean> {
    if (!this.genAI) {
      return false;
    }

    try {
      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: 'Hello, please respond with "OK" if you can hear me.'
      });
      const text = result.text;
      return text.toLowerCase().includes('ok');
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }

  private detectAudioMimeType(filePath: string): string {
    // Get file extension from path
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    // Special handling for .bin files which might contain converted audio data
    if (extension === 'bin') {
      // Check if the file path suggests it was originally WebM
      if (filePath.includes('.mp3_') && filePath.includes('.bin')) {
        console.log('🔍 Detected .bin file from failed MP3 conversion, but contains WebM data - using WebM MIME type');
        // .bin files from failed MP3 conversion actually contain WebM data
        // Send with WebM MIME type for proper processing
        return 'audio/webm';
      }
      // Default to MP3 for other .bin files
      return 'audio/mp3';
    }
    
    switch (extension) {
      case 'webm':
        return 'audio/webm';
      case 'mp3':
        return 'audio/mp3';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      case 'aiff':
        return 'audio/aiff';
      case 'm4a':
        return 'audio/m4a';
      case 'mp4':
        return 'audio/mp4';
      case 'opus':
        return 'audio/opus';
      case 'pcm':
        return 'audio/pcm';
      default:
        console.warn(`Unknown audio file extension: ${extension}, defaulting to audio/mp3`);
        return 'audio/mp3';
    }
  }
}

// Export a singleton instance
const geminiService = new GeminiService();
export default geminiService; 