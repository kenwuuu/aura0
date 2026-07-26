/**
 * Progress for a restore that runs *before* the game exists.
 *
 * A store rather than a callback threaded through `bootstrapGame`: the restore
 * happens inside bootstrap, but the only thing that can show it is a React tree
 * mounted before bootstrap is called. A store is the seam that lets the two meet
 * without bootstrap taking a UI parameter.
 *
 * Lives in the feature, not `app/stores/`, because only this feature and its own
 * screen touch it.
 */
import { create } from 'zustand';

export type SessionImportPhase = 'idle' | 'resolving' | 'writing' | 'done' | 'failed';

interface SessionImportState {
  phase: SessionImportPhase;
  /** Cards resolved so far, and how many there are. Both 0 until resolving starts. */
  done: number;
  total: number;
  /** Names that could not be resolved. Those cards are still restored, without art. */
  unresolved: string[];
  error: string | null;

  begin(): void;
  progress(done: number, total: number): void;
  startWriting(): void;
  finish(unresolved: string[]): void;
  fail(error: string): void;
  reset(): void;
}

const initial = {
  phase: 'idle' as SessionImportPhase,
  done: 0,
  total: 0,
  unresolved: [] as string[],
  error: null as string | null,
};

export const useSessionImportStore = create<SessionImportState>((set) => ({
  ...initial,
  begin: () => set({ ...initial, phase: 'resolving' }),
  progress: (done, total) => set({ done, total }),
  startWriting: () => set({ phase: 'writing' }),
  finish: (unresolved) => set({ phase: 'done', unresolved }),
  fail: (error) => set({ phase: 'failed', error }),
  reset: () => set({ ...initial }),
}));
