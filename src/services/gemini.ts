import { GoogleGenAI } from '@google/genai';
import { TranscriptLine, Speaker, Context, GlobalContext } from '@/models/types';
import { DatabaseService } from './database';

// Interface for Gemini analysis results
export interface MeetingAnalysis {
  title: string;
  description: string;
  notes: string;
  tags: string[];
  summary: string;
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
      const electronAPI = (window as any).electronAPI;
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

  async transcribeAudio(audioFile: File | string): Promise<GeminiTranscriptionResult> {
    if (!this.genAI) {
      throw new Error('Gemini AI is not initialized. Please check your API key.');
    }

    try {
      console.log('Starting Gemini audio transcription...', { audioFile: typeof audioFile === 'string' ? audioFile : 'File object' });
      
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
          // For file paths, we need to read the file first
          const electronAPI = (window as any).electronAPI;
          if (electronAPI?.readAudioFile) {
            console.log('Reading audio file via Electron API:', audioFile);
            
            // First check if file exists
            if (electronAPI?.checkFileExists) {
              const fileExists = await electronAPI.checkFileExists(audioFile);
              if (!fileExists) {
                throw new Error(`Audio file not found or is empty: ${audioFile}`);
              }
            }
            
            const audioData = await electronAPI.readAudioFile(audioFile);
            if (!audioData.success) {
              console.error('Failed to read audio file:', audioData);
              throw new Error(`Failed to read audio file: ${audioData.error || 'Unknown error'}`);
            }
            
            console.log('Audio file read successfully, size:', audioData.buffer?.length || 'unknown');
            
            // Convert the audio data to a Blob
            const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });
            uploadedFile = await this.genAI.files.upload({
              file: audioBlob,
              config: { mimeType: 'audio/mp3' }
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
2. Format the output with each speaker's dialogue on separate lines
3. Use the format: "Speaker X: [dialogue]"
4. If you can detect speaker changes within a single turn, break them into separate lines
5. Maintain chronological order of the conversation
6. Include all speech content, even brief interjections

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
      const { transcript, speakers } = this.parseTranscriptionWithSpeakers(transcriptionText);

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

  private parseTranscriptionWithSpeakers(transcriptionText: string): { transcript: string, speakers: Speaker[] } {
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
        
        // Create speaker if not exists
        if (!speakerMap.has(speakerNumber)) {
          speakerMap.set(speakerNumber, {
            id: speakerNumber,
            meetingId: '', // Will be set when used
            name: speakerLabel,
            color: speakerColors[colorIndex % speakerColors.length],
            type: 'speaker'
          });
          colorIndex++;
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
You are an AI assistant specialized in analyzing meeting transcripts and generating comprehensive meeting summaries. 

${contextPrompt}

Meeting Transcript:
${transcriptText}

Based on the transcript and context provided, please generate a comprehensive analysis in the following JSON format:

{
  "title": "A concise, descriptive title for the meeting (max 60 characters)",
  "description": "A brief 1-2 sentence description of the meeting's purpose and main topics",
  "summary": "A detailed summary of the key points, decisions, and outcomes discussed",
  "notes": "Comprehensive meeting notes in markdown format, including:\n- Key discussion points\n- Decisions made\n- Action items identified\n- Important insights or concerns raised\n- Next steps or follow-up items",
  "tags": ["array", "of", "relevant", "tags", "for", "categorization"]
}

Guidelines:
- Make the title specific and actionable
- Keep the description concise but informative
- Structure the notes with clear headings and bullet points
- Include 3-8 relevant tags that would help categorize and search for this meeting
- Focus on actionable insights and key takeaways
- If the transcript is unclear or incomplete, note this in the summary

Please respond with valid JSON only, no additional text.`;

      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: prompt
      });

      const text = result.text;

      // Parse the JSON response
      try {
        const analysis = JSON.parse(text);
        
        // Validate the response structure
        if (!analysis.title || !analysis.description || !analysis.notes || !Array.isArray(analysis.tags)) {
          throw new Error('Invalid response structure from Gemini');
        }

        return {
          title: analysis.title.substring(0, 100), // Ensure reasonable length
          description: analysis.description.substring(0, 500),
          notes: analysis.notes,
          tags: analysis.tags.slice(0, 10), // Limit to 10 tags
          summary: analysis.summary || analysis.notes.substring(0, 300) + '...'
        };
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', parseError);
        console.log('Raw response:', text);
        
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
      summary: `Meeting with ${speakers.size} participants. Full transcript available in notes.`
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
}

// Export a singleton instance
const geminiService = new GeminiService();
export default geminiService; 