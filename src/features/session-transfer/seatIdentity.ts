/**
 * How a player recognises which seat was theirs.
 *
 * This is a safety feature, not a nicety. Claiming the wrong seat hands you an
 * opponent's hand — the UI reveals it as if it were yours — so the picker has to
 * make the answer obvious rather than asking someone to guess from a random-id
 * name and a life total.
 *
 * ## Why not "which side of the board you were on"
 *
 * Tempting, and wrong: every client centres its camera on its *own* mat
 * (`computeLocalMatOrigin` in battlefield/usePlaymatNodes.ts), so every player
 * experiences themselves as sitting in the same place. "The left seat" is not a
 * memory anybody has, because nobody ever saw themselves on the left.
 *
 * ## What identifies a seat instead
 *
 * Three signals, strongest first, none of which reveals anything private:
 *
 * 1. **Deck name** — what the player themselves called it. Format-agnostic and
 *    unambiguous. Absent from games saved before `YSTATE_DECK_NAME` existed, and
 *    from seats that never loaded a named deck, so it cannot be the only signal.
 * 2. **Commander** — in this app's primary format your commander *is* your
 *    identity, and it is public information by the rules of Commander: everyone
 *    at the table already knows who you are playing. Free, from cards already
 *    flagged `commander` at import.
 * 3. **Cards in play** — what the seat had on the battlefield. Fully public
 *    during the game (anyone could see it), and the sharpest recogniser once a
 *    game is under way.
 *
 * Hand contents are deliberately *not* used. They are the one thing the picker
 * exists to protect.
 */
import type { SeatSnapshot, CardRef } from './sessionSnapshot';

/** How many battlefield cards to name before summarising the rest. */
const IN_PLAY_SHOWN = 3;

export interface SeatIdentity {
  seatId: string;
  name: string;
  color: string;
  health: number;
  deckCount: number;
  handCount: number;
  /** The deck's own name, when the seat has one. */
  deckName?: string;
  /** Commander names — usually one, two for partners. Public info in Commander. */
  commanders: string[];
  /** Names of cards this seat had on the battlefield. Public during play. */
  inPlay: string[];
}

const unique = (names: string[]) => [...new Set(names.filter(Boolean))];

/**
 * Build the identity for one seat.
 *
 * `board` is the whole battlefield; this picks out the cards the seat owns.
 */
export function seatIdentityFor(seat: SeatSnapshot, board: CardRef[]): SeatIdentity {
  const owned = board.filter((card) => card.ownerId === seat.seatId);

  // A commander can be anywhere by now — still in the deck, drawn into the
  // opening hand, or out on the battlefield — so look across all of them rather
  // than assuming the zone it starts in.
  const commanders = unique(
    [
      ...Object.values(seat.zones).flat(),
      ...owned,
    ]
      .filter((card) => card.commander)
      .map((card) => card.name),
  );

  return {
    seatId: seat.seatId,
    name: seat.name,
    color: seat.color,
    health: seat.health,
    deckCount: seat.zones.deck.length,
    handCount: seat.zones.hand.length,
    ...(seat.deckName ? { deckName: seat.deckName } : {}),
    commanders,
    inPlay: unique(owned.map((card) => card.name)),
  };
}

export function seatIdentities(
  seats: SeatSnapshot[],
  board: CardRef[],
): SeatIdentity[] {
  return seats.map((seat) => seatIdentityFor(seat, board));
}

/**
 * The one line most likely to make a player say "that's me".
 *
 * Falls through the signals in order of how specific they are, and ends at the
 * life total — which identifies nothing on its own, but is better than an empty
 * row when a game was saved before anyone had done anything.
 */
export function seatHeadline(identity: SeatIdentity): string {
  if (identity.deckName) return identity.deckName;
  if (identity.commanders.length > 0) return identity.commanders.join(' & ');
  if (identity.inPlay.length > 0) return describeInPlay(identity.inPlay);
  return `${identity.health} life`;
}

/** "Sol Ring, Llanowar Elves, and 2 more" — bounded so a wide board still fits. */
export function describeInPlay(inPlay: string[]): string {
  if (inPlay.length === 0) return '';
  const shown = inPlay.slice(0, IN_PLAY_SHOWN);
  const rest = inPlay.length - shown.length;
  return rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ');
}

/**
 * Whether this seat can be told apart from the others on offer.
 *
 * Two seats that look identical are the case where someone guesses — and a
 * guess is what leaks a hand. The picker warns rather than pretending the row
 * is informative.
 */
export function isAmbiguous(identity: SeatIdentity, all: SeatIdentity[]): boolean {
  const headline = seatHeadline(identity);
  return all.some(
    (other) => other.seatId !== identity.seatId && seatHeadline(other) === headline,
  );
}
