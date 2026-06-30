/**
 * React hook for subscribing to the shared action log Y.Array.
 *
 * Follows the same observe/unobserve lifecycle as useBattlefieldNodes.ts.
 * Returns a snapshot of all entries; the component re-renders whenever
 * any peer appends or the soft-cap trim removes oldest entries.
 */

import { useState, useEffect } from 'react';
import * as Y from 'yjs';
import { getActionLog } from './actionLog';
import type { ActionLogEntry } from './types';

export function useActionLog(yDoc: Y.Doc | null): ActionLogEntry[] {
  const [entries, setEntries] = useState<ActionLogEntry[]>(
    () => (yDoc ? getActionLog(yDoc).toArray() : []),
  );

  useEffect(() => {
    if (!yDoc) return;
    const arr = getActionLog(yDoc);
    const sync = () => setEntries(arr.toArray());
    arr.observe(sync);
    sync(); // hydrate immediately in case entries already exist (e.g. IndexedDB restore)
    return () => arr.unobserve(sync);
  }, [yDoc]);

  return entries;
}
