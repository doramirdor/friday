
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ContextFile {
  id: string;
  name: string;
  size: string;
  type: string;
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
  
  const handleAddFiles = () => {
    // In a real implementation, this would open a file picker
    toast.info("File picker would open here");
    
    // Simulate adding a new file
    const newFile = {
      id: `f${Date.now()}`,
      name: `new-file-${contextFiles.length + 1}.pdf`,
      size: "1.2 MB",
      type: "PDF"
    };
    
    setContextFiles([...contextFiles, newFile]);
    toast.success(`Added ${newFile.name}`);
  };
  
  const handleRemoveFile = (id: string) => {
    const fileToRemove = contextFiles.find(file => file.id === id);
    setContextFiles(contextFiles.filter(file => file.id !== id));
    
    if (fileToRemove) {
      toast.success(`Removed ${fileToRemove.name}`);
    }
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
          <Label htmlFor="context-name">Context Name</Label>
          <Input
            id="context-name"
            value={globalContext.name}
            onChange={(e) => setGlobalContext({ ...globalContext, name: e.target.value })}
          />
        </div>
        
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
                <Button
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleRemoveFile(file.id)}
                  className="text-destructive hover:text-destructive"
                >
                  Remove
                </Button>
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
      </div>
    </div>
  );
};

export default ContextSettings;
