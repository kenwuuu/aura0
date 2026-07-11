import { Card, CardImages } from '@/features/player/types';
import { makeCard } from '@/features/player/makeCard';
import { CardDataResult, ScryfallCard } from './types';

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

export function toCardDataResult(
  scryfallCard: ScryfallCard,
  count: number = 1,
  commander: boolean = false,
): CardDataResult {
  return {
    count,
    name: scryfallCard.name,
    type_line: scryfallCard.type_line,
    oracleText: scryfallCard.oracle_text,
    scryfallId: scryfallCard.id,
    imageUris: extractImageUris(scryfallCard),
    ...(commander ? { commander: true } : {}),
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
