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

  async transcribeAudio(audioFile: File | string, maxSpeakers: number = 4): Promise<GeminiTranscriptionResult> {
    if (!this.genAI) {
      throw new Error('Gemini AI is not initialized. Please check your API key.');
    }

    try {
      console.log('Starting Gemini audio transcription...', { audioFile: typeof audioFile === 'string' ? audioFile : 'File object', maxSpeakers });
      
      let uploadedFile;
      
      // Handle both File objects and file paths
      if (typeof audioFile === 'string') {
        console.log('Processing audio file path:', audioFile);
        
        // Check if it's a data URL or blob URL
        if (audioFile.startsWith('data:') || audioFile.startsWith('blob:')) {
          console.log('Converting data/blob URL to File object');
          try {
            const response = await fetch(audioFile);
            const blob = await response.blob();
            const file = new File([blob], 'audio.mp3', { type: 'audio/mp3' });
            
            uploadedFile = await this.genAI.files.upload({
              file: file,
              config: { mimeType: 'audio/mp3' }
            });
          } catch (fetchError) {
            console.error('Error converting data/blob URL:', fetchError);
            throw new Error(`Failed to process audio URL: ${fetchError.message}`);
          }
        } else {
          // Handle file paths - read the file using electron API
          if (window.electronAPI?.readAudioFile) {
            console.log('Reading audio file via Electron API:', audioFile);
            const audioData = await window.electronAPI.readAudioFile(audioFile);
            
            if (!audioData || !audioData.buffer) {
              throw new Error('Failed to read audio file - no data returned');
            }
            
            console.log('Audio file read successfully, size:', audioData.buffer?.byteLength || 'unknown');
            
            // Detect the correct MIME type from the file path
            const mimeType = this.detectAudioMimeType(audioFile as string);
            console.log('Detected MIME type:', mimeType);
            
            // Convert the audio data to a Blob with correct MIME type
            const audioBlob = new Blob([audioData.buffer], { type: mimeType });
            uploadedFile = await this.genAI.files.upload({
              file: audioBlob,
              config: { mimeType: mimeType }
            });
          } else {
            throw new Error('File reading not available in this environment');
          }
        }
      } else {
        // Handle File objects directly
        console.log('Processing File object:', audioFile.name, audioFile.type, audioFile.size);
        uploadedFile = await this.genAI.files.upload({
          file: audioFile,
          config: { mimeType: audioFile.type || 'audio/mp3' }
        });
      }

      console.log('Audio file uploaded to Gemini, generating transcription...');

      // Request transcription with speaker diarization
      const prompt = `Please provide a detailed transcription of this audio with speaker diarization. 

Requirements:
1. Identify different speakers and label them as "Speaker 1", "Speaker 2", etc.
2. Limit the number of speakers to a maximum of ${maxSpeakers} speakers
3. If you detect more than ${maxSpeakers} different voices, group similar voices together rather than creating new speakers
4. Format the output with each speaker's dialogue on separate lines
5. Use the format: "Speaker X: [dialogue]"
6. If you can detect speaker changes within a single turn, break them into separate lines
7. Maintain chronological order of the conversation
8. Include all speech content, even brief interjections

Please provide the transcription:`;

      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: [
          prompt,
          {
            fileData: {
              mimeType: uploadedFile.mimeType,
              fileUri: uploadedFile.uri
            }
          }
        ]
      });

      const transcriptionText = result.text;

      console.log('Gemini transcription received:', transcriptionText);

      // Parse the transcription to extract speakers and create transcript lines
      const { transcript, speakers } = await this.parseTranscriptionWithSpeakers(transcriptionText, maxSpeakers);

      // Clean up the uploaded file
      try {
        await this.genAI.files.delete(uploadedFile.name);
      } catch (cleanupError) {
        console.warn('Failed to cleanup uploaded file:', cleanupError);
      }

      return {
        transcript,
        speakers
      };

    } catch (error) {
      console.error('Error transcribing audio with Gemini:', error);
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }

  private async parseTranscriptionWithSpeakers(transcriptionText: string, maxSpeakers: number): Promise<{ transcript: string, speakers: Speaker[] }> {
    const lines = transcriptionText.split('\n').filter(line => line.trim());
    const speakerMap = new Map<string, Speaker>();
    const transcriptLines: string[] = [];
    
    // Default speaker colors
    const speakerColors = ['#28C76F', '#7367F0', '#FF9F43', '#EA5455', '#00CFE8', '#9F44D3'];
    let colorIndex = 0;

    for (const line of lines) {
      // Match patterns like "Speaker 1:", "Speaker 2:", etc.
      const speakerMatch = line.match(/^(Speaker\s+(\d+)):\s*(.+)$/i);
      
      if (speakerMatch) {
        const speakerLabel = speakerMatch[1];
        const speakerNumber = speakerMatch[2];
        const dialogue = speakerMatch[3].trim();
        
        // Create speaker if not exists and within limit
        if (!speakerMap.has(speakerNumber)) {
          if (speakerMap.size < maxSpeakers) {
            speakerMap.set(speakerNumber, {
              id: speakerNumber,
              meetingId: '', // Will be set when used
              name: speakerLabel,
              color: speakerColors[colorIndex % speakerColors.length],
              type: 'speaker'
            });
            colorIndex++;
          } else {
            // If we've reached the speaker limit, assign to the last speaker
            const lastSpeakerId = Array.from(speakerMap.keys())[speakerMap.size - 1];
            const lastSpeaker = speakerMap.get(lastSpeakerId);
            if (lastSpeaker) {
              transcriptLines.push(`${lastSpeaker.name}: ${dialogue}`);
              continue;
            }
          }
        }
        
        transcriptLines.push(`${speakerLabel}: ${dialogue}`);
      } else if (line.trim()) {
        // If no speaker pattern found, add to transcript as-is
        transcriptLines.push(line.trim());
      }
    }

    // If no speakers were detected, create a default speaker
    if (speakerMap.size === 0) {
      speakerMap.set('1', {
        id: '1',
        meetingId: '', // Will be set when used
        name: 'Speaker 1',
        color: speakerColors[0],
        type: 'speaker'
      });
      
      // Format the entire transcription under Speaker 1
      const formattedTranscript = transcriptLines.length > 0 
        ? `Speaker 1: ${transcriptLines.join(' ')}`
        : `Speaker 1: ${transcriptionText}`;
      
      return {
        transcript: formattedTranscript,
        speakers: Array.from(speakerMap.values())
      };
    }

    return {
      transcript: transcriptLines.join('\n'),
      speakers: Array.from(speakerMap.values())
    };
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