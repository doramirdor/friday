
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { TagInput } from "@/components/ui/tag-input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

interface NewMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Define form schema with Zod
const formSchema = z.object({
  title: z.string().min(1, { message: "Meeting title is required" }),
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
  liveTranscript: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

const NewMeetingDialog = ({ open, onOpenChange }: NewMeetingDialogProps) => {
  const navigate = useNavigate();
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      context: "",
      tags: [],
      liveTranscript: true,
    },
  });

  const onSubmit = (values: FormValues) => {
    // Create a new meeting ID
    const meetingId = `new-${Date.now()}`;
    
    // Navigate to transcript page with meeting data
    navigate(`/transcript/${meetingId}`, {
      state: {
        title: values.title,
        description: values.context || "",
        tags: values.tags || [],
        contextFiles: contextFiles,
        liveTranscript: values.liveTranscript,
        createdAt: new Date(),
        isNew: true,
      },
    });
    
    toast.success("Meeting created successfully");
    onOpenChange(false);
  };
  
  const handleAddContextFile = () => {
    // This would normally open a file picker dialog
    // For now, we'll just simulate adding a context file
    const mockFile = `document-${contextFiles.length + 1}.pdf`;
    setContextFiles([...contextFiles, mockFile]);
  };
  
  const handleRemoveContextFile = (index: number) => {
    setContextFiles(contextFiles.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Meeting</DialogTitle>
          <DialogDescription>
            Set up your meeting details before starting recording.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meeting Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Weekly Team Standup" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="context"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Context (optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Add information about this meeting..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags (optional)</FormLabel>
                  <FormControl>
                    <TagInput 
                      tags={field.value || []}
                      onTagsChange={field.onChange}
                      placeholder="Add tags..."
                      id="meeting-tags" 
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <div className="space-y-4">
              <Label>Context Files (optional)</Label>
              <div className="border rounded-md p-4 bg-accent/20">
                {contextFiles.length > 0 ? (
                  <ul className="space-y-2">
                    {contextFiles.map((file, index) => (
                      <li key={index} className="flex items-center justify-between">
                        <span className="text-sm">{file}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveContextFile(index)}
                          className="h-8 w-8 p-0 text-destructive"
                        >
                          <span className="sr-only">Remove</span>
                          ×
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No context files added
                  </p>
                )}
              </div>
              
              <Button 
                type="button"
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={handleAddContextFile}
              >
                Add Context Files
              </Button>
            </div>
            
            <FormField
              control={form.control}
              name="liveTranscript"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Live Transcript</FormLabel>
                    <FormDescription>
                      Enable real-time transcription during recording
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="submit">Start Meeting</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default NewMeetingDialog;
