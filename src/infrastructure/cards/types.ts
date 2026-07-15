import { CardImages, CardImageUris } from '@/features/player/types';
import type { SectionKind } from '@/features/deck-manager/DeckListParser';

export type ScryfallCard = {
  id: string;
  name: string;
  /**
   * Printing coordinates. Present on both Scryfall and Aura payloads; declared
   * optional here because most call sites don't need them. The bulk lookup uses
   * `set`+`collector_number` to map a returned card back to the entry that
   * requested it (the response is unordered relative to the request).
   */
  set?: string;
  collector_number?: string;
  type_line?: string;
  image_uris?: CardImageUris;
  oracle_text?: string;
  card_faces?: Array<{
    image_uris?: CardImageUris;
  }>;
  all_parts?: Array<{
    id: string;
    component: string;
    name: string;
    type_line?: string;
    uri: string;
  }>;
};

export type CardDataResult = {
  count: number;
  name: string;
  type_line?: string;
  oracleText?: string;
  scryfallId: string;
  imageUris: CardImages;
  commander?: boolean;
  /**
   * The section of the deck list this entry came from, carried through the
   * lookup so the importer can route `excluded` cards to the sideboard.
   *
   * It has to ride along on the result rather than being recovered by position:
   * the Scryfall fallback re-fetches failed items and prepends them, so results
   * do not come back in the order the entries went in.
   */
  section?: SectionKind;
  error?: string;
};
