import { GoogleGenerativeAI } from '@google/generative-ai';
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
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    this.initializeGemini();
  }

  private async initializeGemini() {
    try {
      // Get API key from database settings
      const settings = await DatabaseService.getSettings();
      const apiKey = settings?.geminiApiKey || localStorage.getItem('gemini-api-key');
      
      if (!apiKey) {
        console.warn('Gemini API key not found. AI features will be disabled.');
        return;
      }

      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      console.log('Gemini AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Gemini AI:', error);
    }
  }

  async reinitialize() {
    await this.initializeGemini();
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

    // Add global context if available
    if (input.globalContext?.description) {
      contextPrompt += `\nGlobal Context: ${input.globalContext.description}`;
    }

    // Add meeting-specific context if available
    if (input.meetingContext?.content) {
      contextPrompt += `\nMeeting Context: ${input.meetingContext.content}`;
    }
    return contextPrompt;
  }

  async analyzeMeeting(input: AnalysisInput): Promise<MeetingAnalysis> {
    if (!this.model) {
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

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

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

  async setApiKey(apiKey: string): Promise<boolean> {
    try {
      localStorage.setItem('gemini-api-key', apiKey);
      await this.initializeGemini();
      return this.model !== null;
    } catch (error) {
      console.error('Failed to set Gemini API key:', error);
      return false;
    }
  }

  isAvailable(): boolean {
    return this.model !== null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.model) {
      return false;
    }

    try {
      const result = await this.model.generateContent('Hello, please respond with "OK" if you can hear me.');
      const response = await result.response;
      const text = response.text();
      return text.toLowerCase().includes('ok');
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const geminiService = new GeminiService();
export default geminiService; 