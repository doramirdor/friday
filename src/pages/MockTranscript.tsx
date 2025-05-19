
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/ui/tag-input";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

// Sample audio URL for our mock transcript
const mockAudioUrl = "https://assets.mixkit.co/active_storage/sfx/2353/2353-preview.mp3";

// Sample speaker data
const sampleSpeakers = [
  { id: "s1", name: "Michael (You)", color: "#28C76F" },
  { id: "s2", name: "Sarah", color: "#7367F0" },
  { id: "s3", name: "David", color: "#FF9F43" },
];

// Sample transcript data
const sampleTranscript = [
  { id: "l1", text: "Let's start our weekly team meeting. We need to discuss the product roadmap for the next quarter.", speakerId: "s1" },
  { id: "l2", text: "I'd like to share some feedback we got from user testing last week. There are several pain points in the onboarding flow that we should address.", speakerId: "s2" },
  { id: "l3", text: "Could you elaborate on the specific issues they encountered?", speakerId: "s1" },
  { id: "l4", text: "Sure. Users found it confusing to set up their profile after signing up. The guidance wasn't clear enough.", speakerId: "s2" },
  { id: "l5", text: "I think we could solve this with better tooltips and a progress indicator showing the steps.", speakerId: "s3" },
  { id: "l6", text: "That's a good idea. Let's also consider simplifying the form itself. Maybe we're asking for too much information upfront.", speakerId: "s1" },
  { id: "l7", text: "I agree. We should focus on collecting only essential information during onboarding and let users fill in optional details later.", speakerId: "s2" },
  { id: "l8", text: "Are there any other issues we should prioritize for the next sprint?", speakerId: "s3" },
  { id: "l9", text: "The dashboard loading performance needs improvement. Some users reported wait times of up to 5 seconds.", speakerId: "s2" },
  { id: "l10", text: "We can optimize the API calls and implement better caching to address that.", speakerId: "s1" },
];

const MockTranscriptPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-background border-b border-border px-6 py-4 flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate("/library")}
          className="h-8 w-8 p-0 rounded-full"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">Back</span>
        </Button>
        
        <h1 className="text-xl font-semibold flex-1">Weekly Team Standup</h1>
        
        <Button
          variant="outline"
          size="sm"
          className="text-sm"
        >
          Save Changes
          <span className="ml-2 text-xs text-muted-foreground">⌘ S</span>
        </Button>
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="w-full">
          {/* Left panel (Transcript) */}
          <ResizablePanel defaultSize={50} minSize={15} maxSize={85}>
            <div className="flex flex-col h-full overflow-hidden">
              {/* Audio player */}
              <div className="p-6 border-b">
                <div className="flex flex-col gap-4 mb-4">
                  {/* Audio Player Component */}
                  <AudioPlayer audioUrl={mockAudioUrl} autoPlay={false} />
                </div>
              </div>
              
              {/* Transcript lines */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium">Transcript</h2>
                  </div>
                  
                  {/* Rendered transcript */}
                  {sampleTranscript.map((line) => (
                    <div 
                      key={line.id}
                      className="p-2 rounded-md hover:bg-accent/50"
                    >
                      <div className="flex gap-2">
                        <span 
                          className="font-medium"
                          style={{ 
                            color: sampleSpeakers.find(s => s.id === line.speakerId)?.color || "#666666",
                          }}
                        >
                          {sampleSpeakers.find(s => s.id === line.speakerId)?.name}
                        </span>
                        <p className="flex-1">{line.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Right panel (Inspector) */}
          <ResizablePanel defaultSize={50} minSize={15} maxSize={85}>
            <Tabs defaultValue="details" className="w-full h-full flex flex-col">
              <TabsList className="w-full justify-start border-b rounded-none px-6 h-12">
                <TabsTrigger value="details" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Details
                </TabsTrigger>
                <TabsTrigger value="action-items" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Action Items
                </TabsTrigger>
                <TabsTrigger value="notes" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="context" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none">
                  Context
                </TabsTrigger>
              </TabsList>
              
              <div className="flex-1 overflow-y-auto">
                <TabsContent value="details" className="p-6 space-y-6 h-full">
                  <div className="space-y-4">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value="Weekly Team Standup"
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value="Discussion about current project status and next steps."
                      rows={4}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <Label htmlFor="tags">Tags</Label>
                    <TagInput
                      id="tags"
                      tags={["meeting", "team", "product"]}
                      placeholder="Add tag..."
                    />
                  </div>

                  <div className="space-y-4">
                    <Label htmlFor="duration">Duration</Label>
                    <Input
                      id="duration"
                      value="15:24"
                      readOnly
                    />
                  </div>

                  <div className="space-y-4">
                    <Label htmlFor="recorded">Recorded on</Label>
                    <Input
                      id="recorded"
                      value="May 19, 2025"
                      readOnly
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="action-items" className="p-6 space-y-6 h-full">
                  <div className="text-center py-16 text-muted-foreground">
                    <p>Action items from the transcript will appear here</p>
                    <p className="mt-2 text-sm">No items have been created yet</p>
                  </div>
                </TabsContent>
                
                <TabsContent value="notes" className="p-6 space-y-6 h-full">
                  <div className="space-y-4">
                    <Label htmlFor="notes">Meeting Notes</Label>
                    <Textarea
                      id="notes"
                      rows={12}
                      placeholder="Add meeting notes here..."
                      className="resize-none"
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="context" className="p-6 space-y-6 h-full">
                  <div className="text-center py-16 text-muted-foreground">
                    <p>No context files have been added</p>
                    <p className="mt-2 text-sm">Add files to provide context for your meeting</p>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default MockTranscriptPage;
