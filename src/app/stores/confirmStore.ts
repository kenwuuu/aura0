/**
 * confirmStore
 *
 * Request/consume store that lets any button or game action open the shared
 * ConfirmDialog without prop-drilling or a component reference — the same
 * pattern as numberPromptStore, but for yes/no confirmations. Cross-cutting
 * (used by both the game-actions and room features), so it lives here rather
 * than inside a single feature.
 */
import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  description: string;
  /** Label shown on the confirm button. Default "Confirm". */
  confirmLabel?: string;
  /** Label shown on the cancel button. Default "Cancel". */
  cancelLabel?: string;
  /** Styles the confirm button as a destructive (red) action. Default false. */
  destructive?: boolean;
  /**
   * Shows a "don't ask again" checkbox with this label. Requires `onSuppress`
   * — a checkbox that can't turn anything off would be a lie.
   */
  dontAskAgainLabel?: string;
  /**
   * Called when the user confirms *with* the checkbox ticked, just before
   * `onConfirm`. Never called on cancel (see the ConfirmDialog header).
   */
  onSuppress?: () => void;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ConfirmStore {
  request: ConfirmRequest | null;
  open: (req: ConfirmRequest) => void;
  consume: () => void;
}

export const useConfirmStore = create<ConfirmStore>((set) => ({
  request: null,
  open: (req) => set({ request: req }),
  consume: () => set({ request: null }),
}));
