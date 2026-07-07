/**
 * ConfirmDialog
 *
 * Generic yes/no confirmation dialog for consequential actions (Reset Deck,
 * New Game, etc). Styled to match NumberPrompt/ScryModal so they feel
 * consistent.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[440px] w-[90%]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="p-6 pt-0">
          <p className="text-gray-400 text-md mb-5">{description}</p>
          <div className="flex gap-3">
            <button
              className="flex-1 px-3 py-3 rounded-lg border-none text-base font-bold cursor-pointer transition-colors bg-[#2d2d2d] text-[#9ca3af] hover:bg-[#3d3d3d]"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              className={
                destructive
                  ? 'flex-1 px-3 py-3 rounded-lg border-none text-base font-bold cursor-pointer transition-colors bg-red-600 text-white hover:bg-red-700'
                  : 'flex-1 px-3 py-3 rounded-lg border-none text-base font-bold cursor-pointer transition-colors bg-blue-500 text-white hover:bg-blue-600'
              }
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
