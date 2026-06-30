import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { rollDieAction, flipCoinAction } from './diceActions';
import { getActionLog } from '@/features/action-log/actionLog';

describe('rollDieAction', () => {
  it('logs a roll_die entry with a result within range', () => {
    const doc = new Y.Doc();
    rollDieAction(doc, 'p1', 6);

    const entry = getActionLog(doc).get(0);
    expect(entry.actorId).toBe('p1');
    expect(entry.type).toBe('roll_die');
    expect(entry.text).toMatch(/^rolled a d6: [1-6]$/);
  });
});

describe('flipCoinAction', () => {
  it('logs a coin_flip entry with Heads or Tails', () => {
    const doc = new Y.Doc();
    flipCoinAction(doc, 'p1');

    const entry = getActionLog(doc).get(0);
    expect(entry.actorId).toBe('p1');
    expect(entry.type).toBe('coin_flip');
    expect(entry.text).toMatch(/^flipped a coin: (Heads|Tails)$/);
  });
});
