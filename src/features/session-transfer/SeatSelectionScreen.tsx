import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { PreGameScreen, PreGameSubtitle } from '@/shared/components/PreGameScreen';
import { YDOC_SESSION, YDOC_SEAT_CLAIMS } from '@/constants';
import { readSessionSeats, claimedSeatIds, type SeatOffer } from './importSession';

/**
 * "Which of these players are you?" — shown to someone opening a link into a
 * restored game.
 *
 * ## Why it has to wait
 *
 * `whenSynced()` resolves on IndexedDB alone, so this screen mounts with an
 * *empty* doc: the game arrives over WebRTC a moment later. That is why the
 * three states below exist rather than a single list — the roster genuinely is
 * not knowable when the screen opens.
 *
 * ## Why "join as a new player" is not optional
 *
 * A third friend joining a resumed game is an ordinary thing to do. Without an
 * escape hatch the invite link is a trap that seats them in somebody else's
 * cards, so the option stays available in every state, including the failure one.
 */

/** How long to wait for the game to arrive before offering a way out. */
export const SEAT_ROSTER_TIMEOUT_MS = 15_000;

type Phase = 'waiting' | 'choosing' | 'unreachable';

export interface SeatSelectionScreenProps {
  yDoc: Y.Doc;
  onClaim: (seatId: string) => void;
  onJoinAsNew: () => void;
  /** Overridable so a test does not have to wait out the real timeout. */
  timeoutMs?: number;
}

export function SeatSelectionScreen({
  yDoc,
  onClaim,
  onJoinAsNew,
  timeoutMs = SEAT_ROSTER_TIMEOUT_MS,
}: SeatSelectionScreenProps) {
  const [seats, setSeats] = useState<SeatOffer[] | null>(() => readSessionSeats(yDoc));
  const [claimed, setClaimed] = useState<Set<string>>(() => claimedSeatIds(yDoc));
  const [timedOut, setTimedOut] = useState(false);

  // The roster and the claims both arrive from peers, and a claim can land while
  // this screen is open — that is the case a poll or a one-shot read would miss,
  // leaving two players fighting over one seat.
  useEffect(() => {
    const session = yDoc.getMap(YDOC_SESSION);
    const claims = yDoc.getMap(YDOC_SEAT_CLAIMS);

    const syncSeats = () => setSeats(readSessionSeats(yDoc));
    const syncClaims = () => setClaimed(claimedSeatIds(yDoc));

    session.observe(syncSeats);
    claims.observe(syncClaims);
    syncSeats();
    syncClaims();

    return () => {
      session.unobserve(syncSeats);
      claims.unobserve(syncClaims);
    };
  }, [yDoc]);

  useEffect(() => {
    if (seats) return;
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [seats, timeoutMs]);

  const phase: Phase = seats ? 'choosing' : timedOut ? 'unreachable' : 'waiting';

  if (phase === 'waiting') {
    return (
      <PreGameScreen title="Resuming your game…" data-testid="seat-selection">
        <PreGameSubtitle>
          Waiting for the game to arrive from the other player. Keep this tab open.
        </PreGameSubtitle>
        <JoinAsNewButton onClick={onJoinAsNew} />
      </PreGameScreen>
    );
  }

  if (phase === 'unreachable') {
    return (
      <PreGameScreen title="Couldn't reach the other player" data-testid="seat-selection">
        <PreGameSubtitle>
          Nobody in this game is online right now, so there's nothing to resume yet. They need
          to have the game open for it to reach you.
        </PreGameSubtitle>
        <div style={{ display: 'flex', gap: 8 }}>
          <SeatButton label="Try again" onClick={() => window.location.reload()} />
          <SeatButton label="Join as a new player" onClick={onJoinAsNew} />
        </div>
      </PreGameScreen>
    );
  }

  return (
    <PreGameScreen title="Resume your game" data-testid="seat-selection">
      <PreGameSubtitle>Which seat is yours?</PreGameSubtitle>

      <ul
        aria-live="polite"
        style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', width: '100%', maxWidth: 380 }}
      >
        {seats!.map((seat) => (
          <li key={seat.seatId} style={{ marginBottom: 8 }}>
            <SeatRow
              seat={seat}
              taken={claimed.has(seat.seatId)}
              onClick={() => onClaim(seat.seatId)}
            />
          </li>
        ))}
      </ul>

      <JoinAsNewButton onClick={onJoinAsNew} />
    </PreGameScreen>
  );
}

/**
 * One seat.
 *
 * The zone counts are the real identifier, not the name: names are often an
 * unset default (a sliced player id), so "97 in deck · 7 in hand · 40 life" next
 * to the colour someone has been looking at all game is what actually lets them
 * recognise their own board.
 *
 * A taken seat stays visible and disabled rather than disappearing — a row
 * vanishing mid-decision is disorienting, while one greying out explains itself.
 */
function SeatRow({
  seat,
  taken,
  onClick,
}: {
  seat: SeatOffer;
  taken: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="seat-option"
      onClick={onClick}
      disabled={taken}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid #404040',
        background: '#262626',
        color: '#e5e5e5',
        textAlign: 'left',
        cursor: taken ? 'default' : 'pointer',
        opacity: taken ? 0.45 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: seat.color || '#737373',
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14 }}>{seat.name}</span>
        <span style={{ display: 'block', fontSize: 12, color: '#a3a3a3' }}>
          {seat.deckCount} in deck · {seat.handCount} in hand · {seat.health} life
        </span>
      </span>
      {taken && <span style={{ fontSize: 12, color: '#a3a3a3', flexShrink: 0 }}>Taken</span>}
    </button>
  );
}

function JoinAsNewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: '#a3a3a3',
        fontSize: 13,
        textDecoration: 'underline',
        cursor: 'pointer',
        padding: 4,
      }}
    >
      Join as a new player
    </button>
  );
}

function SeatButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 6,
        border: '1px solid #404040',
        background: '#262626',
        color: '#e5e5e5',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
