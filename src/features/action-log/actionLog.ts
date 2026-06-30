/**
 * Action log core helpers
 *
 * `logAction` is the single write point for all game events. It appends a
 * well-formed entry to the shared Y.Array and trims the oldest entries when
 * the soft cap is exceeded — both inside one Yjs transaction so the cap
 * maintenance never produces a visible intermediate state.
 */

import * as Y from 'yjs';
import { YDOC_ACTION_LOG, ACTION_LOG_MAX_ENTRIES } from '@/constants';
import type { ActionLogEntry } from './types';

export function getActionLog(yDoc: Y.Doc): Y.Array<ActionLogEntry> {
  return yDoc.getArray<ActionLogEntry>(YDOC_ACTION_LOG);
}

export function logAction(
  yDoc: Y.Doc,
  entry: Omit<ActionLogEntry, 'id' | 'ts'>,
): void {
  const arr = getActionLog(yDoc);
  const full: ActionLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    ts: Date.now(),
  };
  yDoc.transact(() => {
    arr.push([full]);
    if (arr.length > ACTION_LOG_MAX_ENTRIES) {
      arr.delete(0, arr.length - ACTION_LOG_MAX_ENTRIES);
    }
  });
}
