import { useState } from 'react';

/**
 * Shown instead of the game when this room is already open in another tab of
 * the same browser. Two tabs share one localStorage player id but have their
 * own Y.Doc, so they would be two CRDT replicas of the same player, silently
 * overwriting each other's hand — see `infrastructure/networking/tabLock.ts`.
 *
 * The other tab is usually one the player forgot about, so refusing to boot
 * without an escape hatch would strand them: "Play here instead" tells the
 * other tab to stand down and hands this one the room.
 */
export function DuplicateTabNotice({
  roomName,
  onTakeOver,
}: {
  roomName: string;
  onTakeOver: () => Promise<void>;
}) {
  const [takingOver, setTakingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takeOver = async () => {
    setTakingOver(true);
    setError(null);
    try {
      await onTakeOver();
      // On success this tab boots the game and replaces this screen.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take over the game.');
      setTakingOver(false);
    }
  };

  return (
    <div
      className="full-viewport-height"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        color: '#e5e5e5',
        background: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Aura is open in another tab</h1>
      <p style={{ marginBottom: 16, color: '#a3a3a3', maxWidth: 420 }}>
        You already have room <strong style={{ color: '#e5e5e5' }}>{roomName}</strong> open
        somewhere else. Playing it in two tabs at once makes them fight over your hand, and
        cards get lost — so only one tab at a time gets the game.
      </p>
      <button
        onClick={takeOver}
        disabled={takingOver}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid #404040',
          background: '#262626',
          color: '#e5e5e5',
          cursor: takingOver ? 'default' : 'pointer',
          opacity: takingOver ? 0.6 : 1,
        }}
      >
        {takingOver ? 'Taking over…' : 'Play here instead'}
      </button>
      {error && (
        <p style={{ marginTop: 16, fontSize: 12, color: '#f87171', maxWidth: 420 }}>{error}</p>
      )}
    </div>
  );
}
