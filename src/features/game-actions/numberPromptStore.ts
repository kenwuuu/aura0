/**
 * numberPromptStore
 *
 * A thin request/consume store that lets any game action open the shared
 * NumberPrompt modal without prop-drilling or a component reference.
 * The action calls `request(...)` and the NumberPromptManager component
 * subscribes and shows the prompt, then calls `onConfirm(n)` on the action's
 * behalf.
 */

import { create } from 'zustand';

export interface NumberPromptRequest {
  title: string;
  label: string;
  /** Minimum value (inclusive). Default 1. */
  min?: number;
  /** Maximum value (inclusive). Default Infinity. */
  max?: number;
  /** Value pre-filled in the input. Default 1. */
  defaultValue?: number;
  /** Label shown on the confirm button. Default "Confirm". */
  confirmLabel?: string;
  onConfirm: (n: number) => void;
  onCancel?: () => void;
}

interface NumberPromptStore {
  request: NumberPromptRequest | null;
  open: (req: NumberPromptRequest) => void;
  consume: () => void;
}

export const useNumberPromptStore = create<NumberPromptStore>((set) => ({
  request: null,
  open: (req) => set({ request: req }),
  consume: () => set({ request: null }),
}));
