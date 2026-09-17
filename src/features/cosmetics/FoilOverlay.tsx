import styles from './FoilOverlay.module.css';
import { FOIL_STYLE_NEBULA } from './cosmeticsStore';

/**
 * The holographic treatment drawn over a foil card's art.
 *
 * Takes a style id and nothing else — no `Card`, no Yjs, no entitlement lookup.
 * That independence is deliberate: the same component has to render over a
 * battlefield node, a pile-viewer tile, a hand card, and a piece of static art
 * in the store, and none of those should have to construct a card to show a
 * shimmer. Whether a card *should* be foil was decided when `Card.foil` was
 * written; by the time this renders, the question is settled.
 *
 * The caller supplies the positioning context: this fills its parent, so the
 * parent must be positioned and should clip. It never takes pointer events —
 * every surface it sits on has drag, hover and context-menu handlers underneath.
 */
export function FoilOverlay({ styleId }: { styleId: string }) {
  // One style exists today. An unknown id renders nothing rather than falling
  // back to a look the player did not unlock.
  if (styleId !== FOIL_STYLE_NEBULA) {
    return null;
  }

  return (
    <div aria-hidden className={styles.layer} data-testid="foil-overlay" data-foil-style={styleId}>
      <div className={styles.holo} />
      <div className={styles.sheen} />
      <div className={styles.edge} />
    </div>
  );
}
