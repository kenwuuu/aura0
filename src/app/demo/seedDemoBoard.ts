/**
 * seedDemoBoard — writes a small, hand-authored battlefield straight into the
 * Yjs doc so the demo board isn't empty: a few real cards on the local player's
 * mat, a couple already tapped. Positions are seat-0 world coordinates so the
 * board's auto-center lands on them.
 */
import * as Y from 'yjs';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import { seatOrigin } from '@/features/battlefield/boardWorld';
import { DEFAULT_DECK } from '@/features/deck-manager/defaultDeck';

export function seedDemoBoard(yDoc: Y.Doc, playerId: string): void {
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  if (yCards.size > 0) return; // already seeded

  const origin = seatOrigin(0); // local player = seat 0 (bottom row)
  const source = DEFAULT_DECK.cards;

  // A row of four cards on the mat; alternate ones start tapped.
  const layout = [
    { x: 70, y: 70, tapped: false },
    { x: 165, y: 70, tapped: true },
    { x: 260, y: 70, tapped: false },
    { x: 355, y: 70, tapped: true },
  ];

  layout.forEach((slot, i) => {
    const base = source[i];
    if (!base) return;
    const card: WhiteboardCard = {
      ...base,
      x: origin.x + slot.x,
      y: origin.y + slot.y,
      rotation: 0,
      isTapped: slot.tapped,
      isFlipped: false,
      counters: [],
      zIndex: i + 1,
      ownerId: playerId,
    };
    yCards.set(card.id, card);
  });
}
