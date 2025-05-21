import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatabaseService } from "@/services/database";
import { ContextFile as ContextFileType, GlobalContext } from "@/models/types";

const ContextSettings = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [globalContext, setGlobalContext] = useState<GlobalContext | null>(null);
  const [contextFiles, setContextFiles] = useState<ContextFileType[]>([]);
  
  // State for loading indicator
  const [isSaving, setIsSaving] = useState(false);
  
  // Create a reference to the hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State for the dialog
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>("");
  
  // Load global context and context files from database
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load global context
        const gc = await DatabaseService.getGlobalContext();
        if (gc) {
          setGlobalContext(gc);
        }
        
        // Load all context files
        const files = await DatabaseService.getAllContextFiles();
        setContextFiles(files);
      } catch (error) {
        console.error('Error loading context data:', error);
        toast.error('Failed to load context data');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // Save global context changes
  const saveGlobalContext = async (updatedContext: Partial<GlobalContext>) => {
    if (!globalContext) return;
    
    setIsSaving(true);
    try {
      const updatedGC = await DatabaseService.saveGlobalContext({
        ...globalContext,
        ...updatedContext
      });
      
      setGlobalContext(updatedGC);
      toast.success('Global context updated');
    } catch (error) {
      console.error('Error saving global context:', error);
      toast.error('Failed to save global context');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Function to trigger the hidden file input
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Function to handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    setSelectedFile(file);
    
    // For text files, show a preview
    if (file.type.startsWith("text/") || 
        file.name.endsWith('.md') || 
        file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFilePreview(content.substring(0, 1000) + (content.length > 1000 ? '...' : ''));
        setShowFilePreview(true);
      };
      reader.readAsText(file);
    } else if (file.type === 'application/pdf') {
      setFilePreview('PDF files will be processed and used as context for the LLM.');
      setShowFilePreview(true);
    } else {
      // For other file types, just show file info
      setFilePreview(`File type ${file.type} will be parsed and used as context.`);
      setShowFilePreview(true);
    }
  };
  
  // Function to add the selected file to the context
  const confirmAddFile = async () => {
    if (!selectedFile || !globalContext) return;
    
    setIsSaving(true);
    try {
      // Determine file size string
      const fileSizeInBytes = selectedFile.size;
      let fileSizeString = "";
      
      if (fileSizeInBytes < 1024) {
        fileSizeString = `${fileSizeInBytes} B`;
      } else if (fileSizeInBytes < 1024 * 1024) {
        fileSizeString = `${(fileSizeInBytes / 1024).toFixed(1)} KB`;
      } else {
        fileSizeString = `${(fileSizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
      }
      
      // Determine file type display name
      let typeDisplay = "Unknown";
      if (selectedFile.type.includes("pdf")) {
        typeDisplay = "PDF";
      } else if (selectedFile.type.includes("text")) {
        typeDisplay = "Text";
      } else if (selectedFile.name.endsWith('.md')) {
        typeDisplay = "Markdown";
      } else if (selectedFile.type.includes("word") || selectedFile.name.endsWith('.docx')) {
        typeDisplay = "Word";
      } else if (selectedFile.type.includes("csv") || selectedFile.name.endsWith('.csv')) {
        typeDisplay = "CSV";
      }
      
      // Create a new context file object
      const newContextFile: ContextFileType = {
        id: `f${Date.now()}`,
        name: selectedFile.name,
        size: fileSizeString,
        type: typeDisplay,
        mimeType: selectedFile.type,
        content: filePreview,
        addedAt: new Date().toISOString(),
        dbType: 'contextFile'
      };
      
      // Save the context file to database
      const savedFile = await DatabaseService.saveContextFile(newContextFile);
      
      // Add the file to global context
      await DatabaseService.addFileToGlobalContext(savedFile.id);
      
      // Refresh the files list
      const updatedFiles = await DatabaseService.getAllContextFiles();
      setContextFiles(updatedFiles);
      
      // Refresh global context
      const updatedGlobalContext = await DatabaseService.getGlobalContext();
      if (updatedGlobalContext) {
        setGlobalContext(updatedGlobalContext);
      }
      
      toast.success(`Added ${newContextFile.name} to context files`);
    } catch (error) {
      console.error('Error adding context file:', error);
      toast.error('Failed to add context file');
    } finally {
      // Close the preview dialog and reset state
      setShowFilePreview(false);
      setSelectedFile(null);
      setFilePreview("");
      setIsSaving(false);
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  
  const handleAddFiles = () => {
    triggerFileInput();
  };
  
  const handleRemoveFile = async (id: string) => {
    const fileToRemove = contextFiles.find(file => file.id === id);
    if (!fileToRemove) return;
    
    setIsSaving(true);
    try {
      // Delete the file from database
      const success = await DatabaseService.deleteContextFile(id);
      
      if (success) {
        // Update the local state
        setContextFiles(contextFiles.filter(file => file.id !== id));
        toast.success(`Removed ${fileToRemove.name}`);
        
        // Refresh global context
        const updatedGlobalContext = await DatabaseService.getGlobalContext();
        if (updatedGlobalContext) {
          setGlobalContext(updatedGlobalContext);
        }
      }
    } catch (error) {
      console.error('Error removing context file:', error);
      toast.error('Failed to remove context file');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Function to view a file (simulated for now)
  const handleViewFile = (file: ContextFileType) => {
    if (file.content) {
      // If we have content stored, show it in a preview dialog
      setFilePreview(file.content);
      setShowFilePreview(true);
    } else {
      toast.info(`Viewing ${file.name}`, {
        description: "In a full implementation, this would open the file for viewing."
      });
    }
  };
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading context settings...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Global Context</h3>
        <p className="text-sm text-muted-foreground">
          Context is used to provide additional information for all your recordings.
          This can be useful for domain-specific terms, company jargon, or other reference materials.
        </p>
        
        <div className="space-y-3">
          <Label htmlFor="context-description">Description</Label>
          <Textarea
            id="context-description"
            value={globalContext?.description || ""}
            onChange={(e) => setGlobalContext(prev => prev ? { ...prev, description: e.target.value } : null)}
            onBlur={() => globalContext ? saveGlobalContext({ description: globalContext.description }) : null}
            rows={3}
          />
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="context-files">Context Files</Label>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleAddFiles}
            disabled={isSaving}
          >
            {isSaving ? 'Processing...' : 'Add Files'}
          </Button>
          
          {/* Hidden file input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden"
            accept=".txt,.pdf,.md,.docx,.csv"
            onChange={handleFileChange}
          />
        </div>
        
        <div className="border rounded-md divide-y">
          {contextFiles.length > 0 ? (
            contextFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/50 rounded">
                    <span className="text-xs font-medium">{file.type}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.size}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleViewFile(file)}
                    disabled={isSaving}
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleRemoveFile(file.id)}
                    className="text-destructive hover:text-destructive"
                    disabled={isSaving}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground p-4 text-center">
              No context files added yet
            </p>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground">
          Supported file types: .txt, .pdf, .md, .docx, .csv
        </p>
        <p className="text-xs text-muted-foreground">
          These files will be processed and used as context for AI transcription and summarization.
        </p>
      </div>
      
      {/* File Preview Dialog */}
      {showFilePreview && (
        <Dialog open={showFilePreview} onOpenChange={setShowFilePreview}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>
                {selectedFile ? `Add File to Context` : 'File Preview'}
              </DialogTitle>
              <DialogDescription>
                {selectedFile 
                  ? `Preview of ${selectedFile.name} (${selectedFile.type})`
                  : 'File content preview'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="border p-4 rounded-md max-h-[300px] overflow-auto">
              <pre className="text-xs whitespace-pre-wrap">{filePreview}</pre>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFilePreview(false)}>
                {selectedFile ? 'Cancel' : 'Close'}
              </Button>
              {selectedFile && (
                <Button 
                  onClick={confirmAddFile}
                  disabled={isSaving}
                >
                  {isSaving ? 'Adding...' : 'Add to Context'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ContextSettings;
