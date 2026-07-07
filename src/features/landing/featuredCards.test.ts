import { describe, it, expect } from 'vitest';
import { getRecentFeaturedCards, getFeaturedFoilCard } from './featuredCards';

describe('featuredCards service', () => {
  it('returns the requested number of fan cards, each with an image + alt', async () => {
    const cards = await getRecentFeaturedCards(3);
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.imageUrl).toMatch(/^https:\/\/cards\.scryfall\.io\//);
      expect(card.alt).toBeTruthy();
    }
  });

  it('returns fewer cards when asked for more than the pool holds (no padding)', async () => {
    const cards = await getRecentFeaturedCards(99);
    // Bounded by the hardcoded pool; callers never get undefined entries.
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(99);
    expect(cards.every((c) => !!c.imageUrl)).toBe(true);
  });

  it('returns an empty list for a count of 0', async () => {
    expect(await getRecentFeaturedCards(0)).toEqual([]);
  });

  it('returns a single foil card with an image + alt', async () => {
    const foil = await getFeaturedFoilCard();
    expect(foil.imageUrl).toMatch(/^https:\/\/cards\.scryfall\.io\//);
    expect(foil.alt).toBeTruthy();
  });
});
