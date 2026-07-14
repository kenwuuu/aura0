import { Card, CardImages } from '@/features/player/types';
import { makeCard } from '@/features/player/makeCard';
import { CardDataResult, ScryfallCard } from './types';
import type { SectionKind } from '@/features/deck-manager/DeckListParser';

function extractImageUris(cardObj: ScryfallCard): CardImages {
  if (cardObj.image_uris) {
    return {
      front: cardObj.image_uris,
      back: null,
    };
  }

  if (Array.isArray(cardObj.card_faces)) {
    const [faceA, faceB] = cardObj.card_faces;
    return {
      front: faceA?.image_uris || null,
      back: faceB?.image_uris || null,
    };
  }

  return {
    front: null,
    back: null,
  };
}

/**
 * Can this card actually be a commander?
 *
 * Only a legendary card can — a legendary creature, the handful of legendary
 * planeswalkers that say so, or a Background (a legendary enchantment). So a
 * single check on the type line covers every case, and it is the *only* evidence
 * available: the deck list that named this card is plain text and carries no
 * card types at all.
 *
 * That matters, because a commander section in a text list has no reliable end.
 * Exporters variously close it with a blank line, a "Deck" header, or nothing
 * whatsoever, and the parser has to guess where the command zone stops. Every
 * card it guesses wrong about is drawn straight into the opening hand. Here,
 * after the lookup, guessing is no longer necessary — Sol Ring is not legendary,
 * so it is not a commander, whatever the list's formatting implied.
 *
 * A missing type line means the lookup could not tell us (an unresolved card, or
 * a backend that omits it). We keep the tag rather than silently stripping a
 * real commander on the strength of data we do not have.
 */
function canBeCommander(scryfallCard: ScryfallCard): boolean {
  if (!scryfallCard.type_line) {
    return true;
  }
  return scryfallCard.type_line.toLowerCase().includes('legendary');
}

export function toCardDataResult(
  scryfallCard: ScryfallCard,
  count: number = 1,
  commander: boolean = false,
  section?: SectionKind,
): CardDataResult {
  return {
    count,
    name: scryfallCard.name,
    type_line: scryfallCard.type_line,
    oracleText: scryfallCard.oracle_text,
    scryfallId: scryfallCard.id,
    imageUris: extractImageUris(scryfallCard),
    ...(commander && canBeCommander(scryfallCard) ? { commander: true } : {}),
    ...(section ? { section } : {}),
  };
}

export function toCard(
  scryfallCard: ScryfallCard,
  cardNumber: number = -1,
): Card {
  return makeCard({
    cardNumber,
    name: scryfallCard.name,
    type_line: scryfallCard.type_line,
    oracleText: scryfallCard.oracle_text,
    images: extractImageUris(scryfallCard),
    scryfallId: scryfallCard.id,
  });
}

/**
 * Build a Card from a CardDataResult (the shape returned by CardLookupService).
 * Shared by TokenService and MtgTextListDeckImporter so both card-creation paths
 * agree on how a looked-up card's fields map onto a battlefield/deck Card.
 */
export function fromCardDataResult(
  result: CardDataResult,
  overrides: Partial<Card> = {},
): Card {
  return makeCard({
    name: result.name,
    type_line: result.type_line,
    oracleText: result.oracleText,
    scryfallId: result.scryfallId,
    images: result.imageUris,
    ...(result.commander ? { commander: true } : {}),
    ...overrides,
  });
}
