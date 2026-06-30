/**
 * Dice/coin actions
 *
 * Single write point for rolling a die or flipping a coin: rolls, then
 * records the result in the shared action log so every peer sees it.
 */

import * as Y from 'yjs';
import { logAction } from '@/features/action-log/actionLog';
import { rollDie, flipCoin } from './rollDice';

export function rollDieAction(yDoc: Y.Doc, actorId: string, sides: number): void {
  const result = rollDie(sides);
  logAction(yDoc, { actorId, type: 'roll_die', text: `rolled a d${sides}: ${result}` });
}

export function flipCoinAction(yDoc: Y.Doc, actorId: string): void {
  const result = flipCoin();
  logAction(yDoc, { actorId, type: 'coin_flip', text: `flipped a coin: ${result}` });
}
