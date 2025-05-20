import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action: ReactNode;
}

const EmptyState = ({ title, description, action }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="bg-muted rounded-full p-6 mb-6">
        <Mic className="h-12 w-12 text-primary" />
      </div>
      <h2 className="text-2xl font-medium mb-2">{title}</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        {description}
      </p>
      {action}
    </div>
  );
};

export default EmptyState;
