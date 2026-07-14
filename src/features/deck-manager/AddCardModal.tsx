import React, { useState, useEffect, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { InfoIcon } from 'lucide-react';

interface AddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCard: (cardName: string) => Promise<void>;
}

export const AddCardModal: React.FC<AddCardModalProps> = ({ isOpen, onClose, onAddCard }) => {
  const [cardName, setCardName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus input when modal opens
      setTimeout(() => inputRef.current?.focus(), 50);
      // Reset state
      setCardName('');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = cardName.trim();
    if (!trimmedName || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      await onAddCard(trimmedName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add card');
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader className="flex flex-row justify-between items-center ">
          <div className="space-y-1">
            <DialogTitle>Add Card to Hand</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pb-6">

          <Alert className="mb-4">
            <InfoIcon className="h-4 w-4" />
            <AlertTitle>Token cards are double sided</AlertTitle>
            <AlertDescription>
              Press F to flip the card over
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="mb-4">
              <label
                htmlFor="card-name-input"
                className="block mb-2 text-dim text-md"
              >
                Enter the exact card name
              </label>
              <Input
                ref={inputRef}
                id="card-name-input"
                type="text"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder='e.g., "Lightning Bolt"'
                disabled={isLoading}
                className="w-full text-sm"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading && (
              <Alert className="mb-4 bg-accent-2/10 border-accent-2/30">
                <AlertDescription className="text-accent-2">
                  Fetching card from Scryfall...
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <Button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!cardName.trim() || isLoading}
            >
              {isLoading ? 'Adding...' : 'Add to Hand'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};