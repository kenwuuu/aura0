export interface CardImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface CardImages {
  front: CardImageUris | null;
  back?: CardImageUris | null; // For double-faced cards
}

/** The full set of card zones a Player owns. The single source of truth for
 * "which pile" across battlefield drop targets, hotkeys, and pile viewers. */
export type PileType = 'deck' | 'exile' | 'discard' | 'hand' | 'scry' | 'sideboard';

/**
 * Zones whose contents opponents can see. A card's identity may appear in the
 * shared action log only if it is visible in the zone it came from or the one it
 * lands in — see `Player.movePileCard`.
 */
export const PUBLIC_PILES: ReadonlySet<PileType> = new Set<PileType>(['exile', 'discard']);

export interface Card {
  id: string;
  cardNumber: number; // Persistent numbering for stack tracking
  name?: string; // Actual card name from Scryfall
  type_line?: string; // Card type from Scryfall (e.g., "Basic Land — Mountain", "Creature — Human Wizard")
  oracleText?: string; // Official card text
  images?: CardImages; // Image URIs from Scryfall
  scryfallId?: string; // Scryfall ID for future API calls
  commander?: boolean; // Imported under a commander header — auto-drawn into the opening hand
  x: number;
  y: number;
  rotation: number;
  isTapped: boolean;
  isFlipped: boolean;
  counters: number[]; // Array of counter values
}

export interface DeckMetadata {
  id: string; // Unique deck ID
  name: string; // User-provided deck name
  format?: string; // Commander, Standard, Modern, etc.
  source: 'scryfall' | 'moxfield' | 'manual';
  cardCount: number;
  importedAt: Date;
  lastModified: Date;
}

export interface SavedDeck {
  metadata: DeckMetadata;
  cards: Card[]; // Full card list with images
  /**
   * Cards imported from a sideboard/maybeboard/companion section, kept out of
   * the deck itself. Optional because decks saved before sideboards existed
   * don't carry it — treat absent as empty, never as "not yet loaded".
   */
  sideboard?: Card[];
}

export interface CustomCounter {
  id: string;
  title: string;
  icon: string;
  value: number;
}

export interface PlayerState {
  id: string;
  name: string;
  health: number;
  hand: Card[];
  exilePile: Card[];
  discardPile: Card[];
  deck: Card[];
  sideboard: Card[];
  customCounters: CustomCounter[];
}

export interface PlayerConfig {
  initialHealth: number;
}