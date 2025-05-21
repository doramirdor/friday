import { useState, useEffect } from "react";
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

interface NewMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLiveTranscript?: boolean;
}

// Define form schema with Zod
const formSchema = z.object({
  title: z.string().min(2, {
    message: "Title must be at least 2 characters.",
  }),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  liveTranscript: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

const NewMeetingDialog = ({ 
  open, 
  onOpenChange,
  initialLiveTranscript = false 
}: NewMeetingDialogProps) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [liveTranscript, setLiveTranscript] = useState(initialLiveTranscript);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      tags: [],
      liveTranscript: initialLiveTranscript,
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setTags([]);
      setLiveTranscript(initialLiveTranscript);
      form.reset({
        title: "",
        description: "",
        tags: [],
        liveTranscript: initialLiveTranscript,
      });
    }
  }, [open, initialLiveTranscript, form]);

  const onSubmit = () => {
    // Navigate to transcript details page with the new meeting data
    navigate(`/transcript/new`, {
      state: {
        title: title,
        description: description,
        tags: tags,
        createdAt: new Date(),
        isNew: true,
        liveTranscript: liveTranscript,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Start New Meeting</DialogTitle>
          <DialogDescription>
            Fill in the details below to create a new meeting.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input 
              id="title" 
              placeholder="Weekly Team Standup" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea 
              id="description" 
              placeholder="Discuss project status and upcoming tasks..."
              value={description}
              onChange={(e) => setDescription(e.target.value)} 
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="tags">Tags</Label>
            <TagInput 
              id="tags"
              placeholder="Add tag..."
              tags={tags}
              onTagsChange={setTags}
            />
          </div>
          
          <div className="flex items-center space-x-2 pt-2">
            <Switch 
              id="live-transcript" 
              checked={liveTranscript}
              onCheckedChange={setLiveTranscript}
            />
            <Label htmlFor="live-transcript">Enable live transcription</Label>
          </div>
        </div>
        
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" onClick={onSubmit}>
            Start Meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewMeetingDialog;
