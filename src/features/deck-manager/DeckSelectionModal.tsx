import React, { useState, useEffect } from 'react';
import posthog from 'posthog-js';
import { DeckStorageService } from '@/infrastructure/persistence';
import { DeckMetadata, SavedDeck } from '@/features/player/types';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

interface DeckSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeckSelected: (deck: SavedDeck) => void;
  onImportNewDeck: () => void;
}

export function DeckSelectionModal({
  isOpen,
  onClose,
  onDeckSelected,
  onImportNewDeck,
}: DeckSelectionModalProps) {
  const [decks, setDecks] = useState<DeckMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDecks().then(r => {});
  }, []);

  useEffect(() => {
    // Reload decks when modal opens to ensure fresh data
    if (isOpen) {
      loadDecks().then(r => {});
    }
  }, [isOpen]);

  const loadDecks = async () => {
    setError(null);

    try {
      const storage = new DeckStorageService();
      const deckMetadata = await storage.getAllDeckMetadata();

      // Sort by last modified (newest first)
      deckMetadata.sort((a, b) =>
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );

      setDecks(deckMetadata);
    } catch (err) {
      console.error('Error loading decks:', err);
      setError('Failed to load decks');
    }
  };

  const handleSelectDeck = async (deckId: string) => {
    try {
      const storage = new DeckStorageService();
      const deck = await storage.getDeck(deckId);

      if (deck) {
        onDeckSelected(deck);
        onClose();
      } else {
        setError('Deck not found');
      }
    } catch (err) {
      console.error('Error loading deck:', err);
      setError('Failed to load deck');
    }
  };

  const handleDeleteDeck = async (deckId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this deck?')) {
      return;
    }

    try {
      const storage = new DeckStorageService();
      await storage.deleteDeck(deckId);
      posthog.capture('deck_deleted', { deck_id: deckId });
      await loadDecks();
    } catch (err) {
      console.error('Error deleting deck:', err);
      setError('Failed to delete deck');
    }
  };

  const handleImportNew = () => {
    onClose();
    onImportNewDeck();
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[90%] xl:min-w-[700px] data-[state=open]:animate-none data-[state=closed]:animate-none">
        <DialogHeader>
          <DialogTitle>Select a Deck</DialogTitle>
          <DialogDescription>
            Choose a deck to load or import a new one
          </DialogDescription>
        </DialogHeader>

        <div>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {decks.length === 0 && (
            <div className="text-center py-8 text-dim">
              <p>No decks found. Import your first deck to get started!</p>
            </div>
          )}

          {decks.length > 0 && (
            <div className="space-y-2 py-2 max-h-[400px] overflow-y-auto">
              {decks.map((deck) => (
                <div
                  key={deck.id}
                  className="mx-6 border flex items-center justify-between p-4 bg-surface border-line-2 rounded-md hover:border-primary hover:shadow-[0_0_14px_var(--glow)] hover:scale-[1.02] ease transition-all duration-200 cursor-pointer"
                  onClick={() => handleSelectDeck(deck.id)}
                >
                  <div className="flex-1">
                    <h3 className="text-foreground font-semibold mb-1">{deck.name}</h3>
                    <div className="flex gap-3 text-sm text-dim mb-1">
                      <span>{deck.cardCount} cards</span>
                      {deck.format && <span>{deck.format}</span>}
                      <span>{deck.source}</span>
                    </div>
                    <p className="text-xs text-mute">
                      Last modified: {formatDate(deck.lastModified)}
                    </p>
                  </div>
                  <button
                    className="ml-4 px-3 py-2 text-dim hover:text-danger hover:bg-surface rounded transition-colors"
                    onClick={(e) => handleDeleteDeck(deck.id, e)}
                    title="Delete deck"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImportNew}
          >
            Import New Deck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}