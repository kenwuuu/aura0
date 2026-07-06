import { DeckMetadata, SavedDeck } from '@/features/player/types';

/**
 * Result of importing a deck from text. Same shape as a `SavedDeck`, except the
 * importer doesn't know the deck's final id/name yet (assigned when the user
 * saves it), so metadata is partial; per-card lookup failures surface as errors.
 */
export interface DeckImportResult extends Omit<SavedDeck, 'metadata'> {
  metadata: Partial<DeckMetadata>;
  errors?: string[];
}

export abstract class DeckImporter {
  /**
   * Import a deck from text format
   * @param text The deck list in the importer's expected format
   * @returns Promise resolving to import result with cards and metadata
   */
  public abstract importFromText(text: string): Promise<DeckImportResult>;
}