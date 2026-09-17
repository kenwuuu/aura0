/**
 * Cosmetics — subscriber-gated visual flourishes.
 *
 * Entitlement flows through `isEntitled`/`getIsEntitled`, the single swap point
 * for a future backend. What a given card looks like is decided at write time
 * and recorded on the card (`Card.foil`), not read from this store at render
 * time — peers cannot see this store.
 */
export {
  useCosmeticsStore,
  getIsEntitled,
  FOIL_STYLE_NEBULA,
  type RedeemOutcome,
} from './cosmeticsStore';
export { FoilOverlay } from './FoilOverlay';
export { foilStyleFor } from './foilVisibility';
