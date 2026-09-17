/**
 * Whether a card's foil should be drawn on a given surface — pure, no React.
 *
 * Shared by the battlefield, the pile viewer and the hand so the three cannot
 * drift, which matters because they disagree about what "face down" means and
 * each would otherwise invent its own answer.
 */
import type { Card } from '@/features/player/types';
import { isHiddenFacedown } from '@/features/battlefield/nodes/cardNodeLogic';

/**
 * The foil style to draw, or `null` for none.
 *
 * `concealed` is the surface's own notion of "this card's face is hidden from
 * the viewer" — the pile viewer has one (a face-down pile) that has nothing to
 * do with the card's flip state. Callers with no such notion pass nothing.
 *
 * A concealed card never shimmers. A card back is not foil, and drawing one
 * would also announce that a hidden card is a foil printing, which is a fact
 * about a card the viewer is not supposed to be able to identify.
 *
 * Note this reads `foil`, never `isFoil`: the entitlement question was settled
 * when `foil` was written, so no renderer needs to consult the cosmetics store.
 * A card flipped to a *real* back face still shimmers — a foil card is foil on
 * both sides, and `isHiddenFacedown` is already false for that case.
 */
export function foilStyleFor(
  card: Pick<Card, 'foil' | 'isFlipped' | 'images'>,
  concealed: boolean = false,
): string | null {
  if (card.foil === undefined || concealed || isHiddenFacedown(card)) {
    return null;
  }
  return card.foil;
}
