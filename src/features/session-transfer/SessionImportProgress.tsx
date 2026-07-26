import { PreGameScreen, PreGameSubtitle } from '@/shared/components/PreGameScreen';
import { useSessionImportStore } from './sessionImportStore';

/**
 * Shown while a restored game is being rebuilt.
 *
 * The wait is real work, not a spinner for its own sake: a snapshot carries no
 * card art or text, so every distinct card in the game has to be looked up again
 * before the board can render. Two decks is usually a second or two.
 *
 * It also covers the moment before bootstrap has decided *which* kind of resume
 * this is — the player who was sent a link sees this briefly, then the seat
 * picker. Hence no counts until there are counts.
 */
export function SessionImportProgress() {
  const { phase, done, total, error } = useSessionImportStore();

  if (phase === 'failed') {
    return (
      <PreGameScreen title="Couldn't restore that game" data-testid="session-import-progress">
        <PreGameSubtitle>{error ?? 'Something went wrong reading the saved game.'}</PreGameSubtitle>
      </PreGameScreen>
    );
  }

  return (
    <PreGameScreen title="Restoring your game…" data-testid="session-import-progress">
      <PreGameSubtitle>
        {total > 0
          ? `Looking up ${total} cards — ${done} done.`
          : 'Fetching the cards this game was played with.'}
      </PreGameSubtitle>
    </PreGameScreen>
  );
}
