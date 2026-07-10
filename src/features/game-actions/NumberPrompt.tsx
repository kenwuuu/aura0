/**
 * NumberPrompt
 *
 * Generic "enter a count" dialog used by Draw X, Scry, Surveil, Mill, etc.
 * Styled to match ScryModal so they feel consistent.
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';

interface NumberPromptProps {
  isOpen: boolean;
  title: string;
  label: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  confirmLabel?: string;
  onConfirm: (n: number) => void;
  onCancel: () => void;
}

export function NumberPrompt({
  isOpen,
  title,
  label,
  min = 1,
  max = Infinity,
  defaultValue = 1,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: NumberPromptProps) {
  const [value, setValue] = useState(String(defaultValue));

  useEffect(() => {
    if (isOpen) {
      setValue(String(defaultValue));
    }
  }, [isOpen, defaultValue]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, value]);

  const parsedValue = parseInt(value, 10);
  const isValid = !isNaN(parsedValue) && parsedValue >= min && parsedValue <= max;

  const handleConfirm = () => {
    if (isValid) onConfirm(parsedValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setValue(v);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[400px] w-[90%]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="p-6 pt-0">
          <label className="block mb-2 text-dim text-md">{label}</label>
          <Input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={handleInputChange}
            className="w-full text-base font-mono tabular-nums"
            autoFocus
          />
          {max !== Infinity && (
            <div className="text-dim text-sm mt-2">
              Max: {max}
            </div>
          )}
          <div className="flex gap-3 mt-5">
            <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={handleConfirm}
              disabled={!isValid}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
