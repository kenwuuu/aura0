/**
 * ConfirmDialog
 *
 * Generic yes/no confirmation dialog for consequential actions (Reset Deck,
 * New Game, etc). Styled to match NumberPrompt/ScryModal so they feel
 * consistent.
 *
 * Opt-out: pass `dontAskAgainLabel` to show a "Don't ask again" checkbox. Its
 * state is reported through `onConfirm(dontAskAgain)` and *only* on confirm —
 * ticking the box and then cancelling changes nothing. Suppressing a
 * confirmation you just backed out of would silently arm the very action you
 * declined, so the checkbox means "yes, and stop asking", never "no, and stop
 * asking".
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Checkbox } from '@/shared/ui/checkbox';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Shows a "don't ask again" checkbox with this label. Omit for no checkbox. */
  dontAskAgainLabel?: string;
  /** `dontAskAgain` is the checkbox state, always false when no checkbox is shown. */
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  dontAskAgainLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="p-6 pt-0">
          <p className="text-gray-400 text-md mb-5">{description}</p>
          {dontAskAgainLabel && (
            <label className="flex items-center gap-2 mb-5 text-sm text-gray-400 cursor-pointer select-none">
              <Checkbox
                checked={dontAskAgain}
                onCheckedChange={(checked) => setDontAskAgain(checked === true)}
              />
              {dontAskAgainLabel}
            </label>
          )}
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
              onClick={() => onConfirm(dontAskAgain)}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
