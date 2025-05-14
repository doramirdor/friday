
import React, { useState, KeyboardEvent, forwardRef } from "react";
import { X } from "lucide-react";
import { Badge } from "./badge";
import { Input } from "./input";
import { cn } from "@/lib/utils";

interface TagInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
}

const TagInput = forwardRef<HTMLInputElement, TagInputProps>(
  ({ tags, onTagsChange, placeholder = "Add tag...", className, ...props }, ref) => {
    const [inputValue, setInputValue] = useState("");
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };
    
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
        e.preventDefault();
        
        // Add tag if it doesn't exist already
        const newTag = inputValue.trim();
        if (!tags.includes(newTag)) {
          onTagsChange([...tags, newTag]);
        }
        
        setInputValue("");
      } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
        // Remove last tag when backspace is pressed on empty input
        onTagsChange(tags.slice(0, -1));
      }
    };
    
    const removeTag = (tagToRemove: string) => {
      onTagsChange(tags.filter((tag) => tag !== tagToRemove));
    };

    return (
      <div className={cn("flex flex-wrap items-center gap-2 p-1 border rounded-md bg-background", className)}>
        {tags.map((tag) => (
          <Badge key={tag} variant="outline" className="flex items-center gap-1 px-2 py-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Remove {tag}</span>
            </button>
          </Badge>
        ))}
        <Input
          ref={ref}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 px-1 py-0 min-w-[80px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          {...props}
        />
      </div>
    );
  }
);

TagInput.displayName = "TagInput";

export { TagInput };
