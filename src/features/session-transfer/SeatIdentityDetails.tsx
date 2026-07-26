import { describeInPlay, seatHeadline, type SeatIdentity } from './seatIdentity';

/**
 * The evidence a player uses to recognise their own seat.
 *
 * Shared by both surfaces that ask the question — `ImportSessionModal` (the
 * player holding the file) and `SeatSelectionScreen` (everyone who followed the
 * link) — because they are the same question, and a seat that is identifiable on
 * one screen but not the other is the gap that leaks a hand.
 */
export function SeatIdentityDetails({
  identity,
  ambiguous = false,
}: {
  identity: SeatIdentity;
  ambiguous?: boolean;
}) {
  const headline = seatHeadline(identity);
  const inPlay = describeInPlay(identity.inPlay);

  return (
    <>
      <span style={{ display: 'block', fontSize: 14 }}>{headline}</span>

      {identity.commanders.length > 0 && headline !== identity.commanders.join(' & ') && (
        <span style={{ display: 'block', fontSize: 12, color: '#a3a3a3' }}>
          {identity.commanders.join(' & ')}
        </span>
      )}

      {inPlay && (
        <span style={{ display: 'block', fontSize: 12, color: '#a3a3a3' }}>
          In play: {inPlay}
        </span>
      )}

      <span style={{ display: 'block', fontSize: 12, color: '#a3a3a3' }}>
        {identity.name} · {identity.deckCount} in deck · {identity.handCount} in hand ·{' '}
        {identity.health} life
      </span>

      {ambiguous && (
        // Two seats that read the same is exactly when someone guesses, and a
        // guess is what reveals an opponent's hand. Say so rather than letting
        // the row look informative.
        <span style={{ display: 'block', fontSize: 12, color: '#fbbf24', marginTop: 2 }}>
          Looks like the other seat — check the life total before picking.
        </span>
      )}
    </>
  );
}
