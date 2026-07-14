import React, { useEffect, useState } from 'react';
import posthog from 'posthog-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';

interface ScryModalProps {
  isOpen: boolean;
  onConfirm: (count: number) => void;
  onCancel: () => void;
  maxCards: number;
}

export const ScryModal: React.FC<ScryModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  maxCards,
}) => {
  const [count, setCount] = useState('1');

  useEffect(() => {
    if (isOpen) {
      setCount('1');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, count]);

  const handleConfirm = () => {
    const numCards = parseInt(count, 10);
    if (!isNaN(numCards) && numCards > 0 && numCards <= maxCards) {
      posthog.capture('scry_performed', { cards_scryed: numCards, max_cards: maxCards });
      onConfirm(numCards);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow positive integers
    if (value === '' || /^\d+$/.test(value)) {
      setCount(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[400px] w-[90%]">
        <DialogHeader>
          <DialogTitle>Scry and Surveil</DialogTitle>
        </DialogHeader>
        <div className="p-6 pt-0">
          <label className="block mb-2 text-dim text-md">
            How many cards?
          </label>
          <Input
            type="text"
            inputMode="numeric"
            value={count}
            onChange={handleInputChange}
            className="w-full text-base font-mono tabular-nums"
            autoFocus
          />
          <div className="text-dim text-sm mt-2">
            Max: {maxCards} card{maxCards !== 1 ? 's' : ''} in deck
          </div>
          <div className="flex gap-3 mt-5">
            <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={handleConfirm}
              disabled={!count || parseInt(count, 10) <= 0 || parseInt(count, 10) > maxCards}
            >
              Scry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};