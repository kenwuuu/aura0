import { Card } from '@/features/player';
import { CARD_WIDTH } from '@/constants';
import { CardLookupService } from './CardLookupService';
import { fromCardDataResult } from './ScryfallCardAdapter';
import { makeTokenId } from '@/shared/utils/ids';

export interface TokenCreationResult {
  tokens: Card[];
  errors: string[];
}

/**
 * Domain service that creates token cards for a given card via Scryfall's
 * `all_parts` field. Delegates all I/O to CardLookupService so token lookups
 * inherit the same Aura → Scryfall fallback as deck import.
 */
export class TokenService {
  private readonly lookup: CardLookupService;
  private tokenCardNumberCounter = 10000;

  constructor(lookup: CardLookupService = new CardLookupService()) {
    this.lookup = lookup;
  }

  async createTokensForCard(
    scryfallId: string,
    position?: { x: number; y: number },
  ): Promise<TokenCreationResult> {
    const tokens: Card[] = [];
    const errors: string[] = [];

    let cardData;
    try {
      cardData = await this.lookup.fetchCardById(scryfallId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed to fetch card data for ${scryfallId}:`, message);
      return { tokens, errors: [`Main card: ${message}`] };
    }

    const tokenIds = this.lookup.extractTokenIds(cardData);
    if (tokenIds.length === 0) {
      console.log(`Card "${cardData.name}" has no associated tokens`);
      return { tokens, errors };
    }

    console.log(`Found ${tokenIds.length} token(s) for "${cardData.name}"`);

    // Fetched concurrently — each lookup is independent, and CardApiClient's
    // internal PQueue is what throttles actual requests to the backend.
    const outcomes = await Promise.all(
      tokenIds.map(async (tokenId, i) => {
        try {
          const tokenData = await this.lookup.fetchCardById(tokenId);
          const tokenCardData = this.lookup.createCardDataResult(tokenData);

          const token: Card = fromCardDataResult(tokenCardData, {
            id: makeTokenId(),
            cardNumber: this.tokenCardNumberCounter++,
            x: position ? position.x + (i + 1) * CARD_WIDTH : 100,
            y: position ? position.y : 100,
          });

          return { token };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Failed to create token ${tokenId}:`, message);
          return { error: `Token ${i + 1}: ${message}` };
        }
      }),
    );

    for (const outcome of outcomes) {
      if (outcome.token) {
        tokens.push(outcome.token);
        console.log(`Created token: ${outcome.token.name}`);
      } else if (outcome.error) {
        errors.push(outcome.error);
      }
    }

    return { tokens, errors };
  }

  async hasTokens(scryfallId: string): Promise<boolean> {
    try {
      const cardData = await this.lookup.fetchCardById(scryfallId);
      return this.lookup.extractTokenIds(cardData).length > 0;
    } catch (err) {
      console.error(`Failed to check tokens for ${scryfallId}:`, err);
      return false;
    }
  }
}
