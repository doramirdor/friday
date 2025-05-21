import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ContextFile {
  id: string;
  name: string;
  size: string;
  type: string;
  path?: string; // Optional path to the actual file
  content?: string; // Optional content preview or actual content for small files
}

const ContextSettings = () => {
  const [globalContext, setGlobalContext] = useState({
    name: "Default Context",
    description: "Global context used for all recordings by default",
  });
  
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([
    { id: "f1", name: "company-handbook.pdf", size: "2.4 MB", type: "PDF" },
    { id: "f2", name: "api-documentation.md", size: "345 KB", type: "Markdown" },
    { id: "f3", name: "team-structure.txt", size: "12 KB", type: "Text" },
  ]);
  
  // Create a reference to the hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State for the dialog
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>("");
  
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
  const confirmAddFile = () => {
    if (!selectedFile) return;
    
    // In a real implementation:
    // 1. Upload/save the file to a secure location
    // 2. Process the file for use with LLM (extract text, etc.)
    // 3. Store reference to the file in the database
    
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
    
    // Add the new file to our context files
    const newFile: ContextFile = {
      id: `f${Date.now()}`,
      name: selectedFile.name,
      size: fileSizeString,
      type: typeDisplay,
      // In a real implementation, these would be populated:
      // path: '/path/to/saved/file.ext',
      // content: filePreview
    };
    
    setContextFiles([...contextFiles, newFile]);
    toast.success(`Added ${newFile.name} to context files`);
    
    // Close the preview dialog and reset state
    setShowFilePreview(false);
    setSelectedFile(null);
    setFilePreview("");
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const handleAddFiles = () => {
    // In a real app, we'd trigger the actual file picker
    triggerFileInput();
  };
  
  const handleRemoveFile = (id: string) => {
    const fileToRemove = contextFiles.find(file => file.id === id);
    setContextFiles(contextFiles.filter(file => file.id !== id));
    
    if (fileToRemove) {
      toast.success(`Removed ${fileToRemove.name}`);
      
      // In a real implementation:
      // 1. Remove file from storage if needed
      // 2. Update database to remove reference to the file
      // 3. Make sure the file won't be used in future LLM contexts
    }
  };
  
  // Function to view a file (simulated for now)
  const handleViewFile = (file: ContextFile) => {
    toast.info(`Viewing ${file.name}`, {
      description: "In a full implementation, this would open the file for viewing."
    });
    
    // In a real implementation:
    // 1. Either open the file in an appropriate viewer
    // 2. Or show a preview of how the file will be used as context
  };
  
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
            value={globalContext.description}
            onChange={(e) => setGlobalContext({ ...globalContext, description: e.target.value })}
            rows={3}
          />
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="context-files">Context Files</Label>
          <Button variant="outline" size="sm" onClick={handleAddFiles}>Add Files</Button>
          
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
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleRemoveFile(file.id)}
                    className="text-destructive hover:text-destructive"
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
      {showFilePreview && selectedFile && (
        <Dialog open={showFilePreview} onOpenChange={setShowFilePreview}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add File to Context</DialogTitle>
              <DialogDescription>
                Preview of {selectedFile.name} ({selectedFile.type})
              </DialogDescription>
            </DialogHeader>
            
            <div className="border p-4 rounded-md max-h-[300px] overflow-auto">
              <pre className="text-xs whitespace-pre-wrap">{filePreview}</pre>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFilePreview(false)}>Cancel</Button>
              <Button onClick={confirmAddFile}>Add to Context</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ContextSettings;
