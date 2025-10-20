import { ScryfallApiService } from './ScryfallApiService';
import { Card } from '../../modules/deck';

export interface TokenCreationResult {
  tokens: Card[];
  errors: string[];
}

/**
 * Service for creating token cards based on Scryfall data
 *
 * ## Architectural Purpose
 *
 * TokenService is a **domain service** that sits between the application layer
 * and infrastructure layer:
 *
 * ```
 * ┌─────────────────────────────────────────────────────┐
 * │  USER ACTION: Plays card from hand to battlefield   │
 * └─────────────────────┬───────────────────────────────┘
 *                       │
 *                       ▼
 * ┌─────────────────────────────────────────────────────┐
 * │  GameResourcesDock / index.ts (Application Layer)   │
 * │  - Handles drop event                               │
 * │  - Calls player.playCardFromHand(cardId)            │
 * │  - Adds card to Whiteboard                          │
 * └─────────────────────┬───────────────────────────────┘
 *                       │
 *                       ▼
 * ┌─────────────────────────────────────────────────────┐
 * │  **TokenService (Domain Service Layer)**            │
 * │  - Checks if card has scryfallId                    │
 * │  - Fetches card data from Scryfall                  │
 * │  - Discovers token IDs from "all_parts"             │
 * │  - Creates token Card objects                       │
 * └─────────────────────┬───────────────────────────────┘
 *                       │
 *                       ▼
 * ┌─────────────────────────────────────────────────────┐
 * │  ScryfallApiService (Infrastructure Layer)          │
 * │  - HTTP requests with rate limiting                 │
 * │  - JSON parsing                                     │
 * │  - Error handling & retries                         │
 * └─────────────────────┬───────────────────────────────┘
 *                       │
 *                       ▼
 * ┌─────────────────────────────────────────────────────┐
 * │  Scryfall API                                       │
 * └─────────────────────────────────────────────────────┘
 * ```
 *
 * ## What TokenService Does:
 * 1. **Orchestrates multi-step workflows** - Coordinates fetching card data,
 *    extracting token IDs, and creating token objects
 * 2. **Domain knowledge** - Understands Magic: The Gathering rules about tokens
 *    and how they relate to cards
 * 3. **Error handling** - Aggregates errors from multiple API calls without
 *    breaking the flow
 * 4. **Card positioning logic** - Decides where tokens should appear on the
 *    battlefield (offset from main card)
 *
 * ## What It Doesn't Do:
 * - ❌ HTTP requests (delegated to ScryfallApiService)
 * - ❌ DOM manipulation (delegated to Whiteboard)
 * - ❌ Player state management (delegated to Player)
 *
 * ## Why Not Just Use ScryfallApiService Directly?
 *
 * **Bad:** Business logic scattered in UI layer
 * ```typescript
 * // In index.ts
 * const cardData = await scryfallApi.fetchCardById(card.scryfallId);
 * const tokenIds = cardData.all_parts?.filter(p => p.component === 'token').map(p => p.id);
 * for (const tokenId of tokenIds) {
 *   const tokenData = await scryfallApi.fetchCardById(tokenId);
 *   const token = { id: ..., x: card.x + offset, ... };
 *   whiteboard.addCard(token);
 * }
 * ```
 * Problems: Hard to test, violates SRP, UI knows about Scryfall structure
 *
 * **Good:** Clean separation with TokenService
 * ```typescript
 * // In index.ts
 * const result = await tokenService.createTokensForCard(
 *   card.scryfallId,
 *   { x: card.x, y: card.y }
 * );
 * result.tokens.forEach(token => whiteboard.addCard(token, playerId));
 * ```
 * Benefits: Testable, reusable, clear responsibilities
 *
 * When a card is played, this service:
 * 1. Fetches the card's data from Scryfall using its ID
 * 2. Extracts any affiliated tokens from the card's "all_parts" field
 * 3. Fetches each token's data and creates Card objects
 */
export class TokenService {
  private scryfallApi: ScryfallApiService;
  private tokenCardNumberCounter: number = 10000; // Start high to avoid conflicts

  constructor(scryfallApi?: ScryfallApiService) {
    this.scryfallApi = scryfallApi || new ScryfallApiService();
  }

  /**
   * Create token cards for a given card's scryfallId
   * @param scryfallId The Scryfall ID of the card that creates tokens
   * @param position Where to place the tokens on the battlefield (optional)
   * @returns Array of token Card objects and any errors encountered
   */
  async createTokensForCard(
    scryfallId: string,
    position?: { x: number; y: number }
  ): Promise<TokenCreationResult> {
    const tokens: Card[] = [];
    const errors: string[] = [];

    try {
      // Fetch the main card's data
      const cardData = await this.scryfallApi.fetchCardById(scryfallId);

      // Extract token IDs from all_parts
      const tokenIds = this.scryfallApi.extractTokenIds(cardData);

      if (tokenIds.length === 0) {
        console.log(`Card "${cardData.name}" has no associated tokens`);
        return { tokens, errors };
      }

      console.log(`Found ${tokenIds.length} token(s) for "${cardData.name}"`);

      // Fetch and create each token
      for (let i = 0; i < tokenIds.length; i++) {
        try {
          const tokenData = await this.scryfallApi.fetchCardById(tokenIds[i]);
          const tokenCardData = this.scryfallApi.createCardFromScryfall(
            tokenData
          );

          // Create the token Card object
          const token: Card = {
            id: `token-${Math.random().toString(36).substring(2, 11)}`,
            cardNumber: this.tokenCardNumberCounter++,
            name: tokenCardData.name,
            images: tokenCardData.imageUris,
            scryfallId: tokenCardData.scryfallId,
            x: position ? position.x + (i * 70) : 100, // Offset tokens horizontally
            y: position ? position.y : 100,
            rotation: 0,
            isTapped: false,
            isFlipped: false,
            counters: [],
          };

          tokens.push(token);
          console.log(`Created token: ${token.name}`);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Failed to create token ${tokenIds[i]}:`, error);
          errors.push(`Token ${i + 1}: ${error}`);
        }
      }

      return { tokens, errors };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed to fetch card data for ${scryfallId}:`, error);
      errors.push(`Main card: ${error}`);
      return { tokens, errors };
    }
  }

  /**
   * Check if a card has associated tokens without creating them
   * @param scryfallId The Scryfall ID of the card
   * @returns Promise<boolean> true if the card has tokens
   */
  async hasTokens(scryfallId: string): Promise<boolean> {
    try {
      const cardData = await this.scryfallApi.fetchCardById(scryfallId);
      const tokenIds = this.scryfallApi.extractTokenIds(cardData);
      return tokenIds.length > 0;
    } catch (err) {
      console.error(`Failed to check tokens for ${scryfallId}:`, err);
      return false;
    }
  }
}