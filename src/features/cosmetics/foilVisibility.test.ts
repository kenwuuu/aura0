import { describe, it, expect } from 'vitest';
import { foilStyleFor } from './foilVisibility';
import { FOIL_STYLE_NEBULA } from './cosmeticsStore';
import type { Card } from '@/features/player/types';

type FoilCard = Parameters<typeof foilStyleFor>[0];

const card = (overrides: Partial<FoilCard> = {}): FoilCard => ({
  foil: FOIL_STYLE_NEBULA,
  isFlipped: false,
  ...overrides,
});

const withBack: FoilCard['images'] = { back: { normal: 'back.png' } } as FoilCard['images'];

describe('foilStyleFor', () => {
  it('draws the style a card carries', () => {
    expect(foilStyleFor(card())).toBe(FOIL_STYLE_NEBULA);
  });

  it('draws nothing for a card with no foil', () => {
    expect(foilStyleFor(card({ foil: undefined }))).toBeNull();
  });

  it('draws nothing for a card hidden face down', () => {
    // A card back is not foil — and shimmering one would announce that a card
    // the viewer cannot identify is a foil printing.
    expect(foilStyleFor(card({ isFlipped: true }))).toBeNull();
  });

  it('still draws on a double-faced card showing its real back', () => {
    // A foil card is foil on both sides, and this face is public — nothing is
    // being concealed, so there is nothing to withhold.
    expect(foilStyleFor(card({ isFlipped: true, images: withBack }))).toBe(FOIL_STYLE_NEBULA);
  });

  it('draws nothing when the surface says the card is concealed', () => {
    // A face-down pile hides its cards without flipping any of them, so the
    // card's own state cannot answer this and the surface has to say so.
    expect(foilStyleFor(card(), true)).toBeNull();
  });

  it('ignores the import flag on its own', () => {
    // `isFoil` is the printing the player owns; `foil` is the entitlement
    // decision. A foil printing nobody paid to light up must render plain.
    // The signature cannot even name `isFoil`, so this passes a whole Card to
    // show the flag is present and still not consulted.
    const unpaidFoil: Card = {
      id: 'c1',
      cardNumber: 1,
      x: 0,
      y: 0,
      rotation: 0,
      isTapped: false,
      isFlipped: false,
      counters: [],
      isFoil: true,
    };

    expect(foilStyleFor(unpaidFoil)).toBeNull();
  });
});
