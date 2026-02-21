"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface UsernameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUsername: string;
  onSave: (username: string) => void;
}

export function UsernameModal({ open, onOpenChange, currentUsername, onSave }: UsernameModalProps) {
  const [input, setInput] = useState(currentUsername);

  const handleSave = () => {
    if (input.trim()) {
      onSave(input.trim());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter your name</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Your name"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <div className="flex gap-2">
            <Button onClick={handleSave} className="flex-1">
              Save
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
