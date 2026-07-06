import { Card, CardImages } from '@/features/player/types';
import { CardDataResult, ScryfallCard } from './types';
import { makeCardId } from '@/shared/utils/ids';

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
): CardDataResult {
  return {
    count,
    name: scryfallCard.name,
    type_line: scryfallCard.type_line,
    oracleText: scryfallCard.oracle_text,
    scryfallId: scryfallCard.id,
    imageUris: extractImageUris(scryfallCard),
  };
}

export function toCard(
  scryfallCard: ScryfallCard,
  cardNumber: number = -1,
): Card {
  return {
    id: makeCardId(),
    cardNumber,
    name: scryfallCard.name,
    type_line: scryfallCard.type_line,
    oracleText: scryfallCard.oracle_text,
    images: extractImageUris(scryfallCard),
    scryfallId: scryfallCard.id,
    x: 100,
    y: 100,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
  };
}
