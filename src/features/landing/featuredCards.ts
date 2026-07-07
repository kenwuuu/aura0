/**
 * Featured-cards service — the source of the "rarest, most recently released"
 * cards the landing page shows off (Hero fan, Cosmetics foil).
 *
 * This deliberately owns card SELECTION only; it knows nothing about how a card
 * is displayed. Callers ask for `n` cards and get back plain descriptors, so the
 * fan/foil markup never has to care where the list came from.
 *
 * Backend TODO: today these are hardcoded Scryfall URLs. When the "recent/rare
 * cards" backend lands, swap the bodies below for a real fetch — the async
 * signatures are already shaped for it, so no call site has to change.
 */

export interface FeaturedCard {
  /** Full card image (Scryfall `display` art). */
  imageUrl: string;
  /** Accessible alt text. Generic until the backend supplies real card names. */
  alt: string;
}

// Hardcoded stand-ins for the fan — newest/rarest printings.
const RECENT_CARDS: FeaturedCard[] = [
  {
    imageUrl:
      'https://cards.scryfall.io/display/front/8/e/8e3c4b2a-4ef7-41ea-a4b5-b0cc942a9889.webp?1782681560',
    alt: 'Recently released Magic: The Gathering card',
  },
  {
    imageUrl:
      'https://cards.scryfall.io/display/front/0/6/06255e9e-5395-41ed-ad89-1e7b2b5478d3.webp?1782681560',
    alt: 'Recently released Magic: The Gathering card',
  },
  {
    imageUrl:
      'https://cards.scryfall.io/display/front/7/f/7ffdca9d-3ee4-4572-b1ad-4f03523968fd.webp?1782681566',
    alt: 'Recently released Magic: The Gathering card',
  },
];

// Hardcoded stand-in for the Cosmetics foil showcase.
const FOIL_CARD: FeaturedCard = {
  imageUrl:
    'https://cards.scryfall.io/display/front/c/d/cdf8c817-3fdf-4121-96b6-869f9c0e496d.webp?1782723912',
  alt: 'Foil Magic: The Gathering card',
};

/** The `count` newest/rarest cards for the Hero fan. */
export async function getRecentFeaturedCards(count: number): Promise<FeaturedCard[]> {
  return RECENT_CARDS.slice(0, count);
}

/** The single card shown in the Cosmetics foil showcase. */
export async function getFeaturedFoilCard(): Promise<FeaturedCard> {
  return FOIL_CARD;
}
