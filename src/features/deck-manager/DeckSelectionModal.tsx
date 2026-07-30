import React, { useState, useEffect, useMemo } from 'react';
import posthog from 'posthog-js';
import { Pencil, Search, Trash2 } from 'lucide-react';
import { DeckStorageService } from '@/infrastructure/persistence';
import { DeckMetadata, SavedDeck } from '@/features/player/types';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
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
  /**
   * Open a saved deck for editing. Handed the whole deck rather than its id
   * because the editor needs the cards — the list view only ever loaded metadata.
   */
  onEditDeck: (deck: SavedDeck) => void;
}

export function DeckSelectionModal({
  isOpen,
  onClose,
  onDeckSelected,
  onImportNewDeck,
  onEditDeck,
}: DeckSelectionModalProps) {
  const [decks, setDecks] = useState<DeckMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadDecks().then(r => {});
  }, []);

  useEffect(() => {
    // Reload decks when modal opens to ensure fresh data
    if (isOpen) {
      // A query left over from last time would greet the next open with a list
      // that hides most of the library and no obvious reason why.
      setSearchQuery('');
      loadDecks().then(r => {});
    }
  }, [isOpen]);

  /**
   * Match against every field the row shows. Someone scanning this list is as
   * likely to reach for "commander" or "moxfield" as for a deck's name, and a
   * name-only filter would answer those with an empty list.
   */
  const visibleDecks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return decks;

    return decks.filter((deck) =>
      [deck.name, deck.format, deck.source]
        .some((field) => field?.toLowerCase().includes(query))
    );
  }, [decks, searchQuery]);

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

  /**
   * Open a deck in the import dialog.
   *
   * Fetches the full record first: the list is built from metadata alone, and an
   * editor with no cards behind it could only ever offer an empty box.
   */
  const handleEditDeck = async (deckId: string, e: React.MouseEvent) => {
    // The row itself loads the deck into the game. Editing must not also do that.
    e.stopPropagation();

    try {
      const storage = new DeckStorageService();
      const deck = await storage.getDeck(deckId);

      if (deck) {
        onEditDeck(deck);
      } else {
        setError('Deck not found');
      }
    } catch (err) {
      console.error('Error loading deck for editing:', err);
      setError('Failed to open deck for editing');
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
      <DialogContent
        size="lg"
        data-testid="deck-selection-modal"
        className="data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
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

          {decks.length > 0 && (
            <div className="mx-6 mt-4 relative">
              <Search
                size={16}
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search decks..."
                aria-label="Search decks"
                data-testid="deck-search"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#2a2a2a] border border-[#3d3d3d] rounded-md text-white outline-none transition-all duration-200 placeholder:text-[#666] focus:border-blue-500 focus:bg-[#333]"
              />
            </div>
          )}

          {decks.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p>No decks found. Import your first deck to get started!</p>
            </div>
          )}

          {decks.length > 0 && visibleDecks.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p>No decks match "{searchQuery.trim()}".</p>
            </div>
          )}

          {visibleDecks.length > 0 && (
            <div className="space-y-2 py-2 max-h-[400px] overflow-y-auto">
              {visibleDecks.map((deck) => (
                <div
                  key={deck.id}
                  className="mx-6 border-2 flex items-center justify-between p-4 bg-[#2a2a2a] border-[#3d3d3d] rounded-lg hover:bg-[#1a1a1a] hover:border-[#3b82f6] hover:scale-[1.02] ease transition-all duration-200 cursor-pointer"
                  onClick={() => handleSelectDeck(deck.id)}
                >
                  <div className="flex-1">
                    <h3 className="text-white font-semibold mb-1">{deck.name}</h3>
                    <div className="flex gap-3 text-sm text-gray-400 mb-1">
                      <span>{deck.cardCount} cards</span>
                      {deck.format && <span>{deck.format}</span>}
                      <span>{deck.source}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Last modified: {formatDate(deck.lastModified)}
                    </p>
                  </div>
                  {/* Drawn icons, not emoji: an emoji is a fixed multicolor
                      glyph from the OS font, so it can't take the row's text
                      color, can't shift on hover with everything around it, and
                      renders differently on every platform. */}
                  <button
                    className="ml-4 px-3 py-2 text-gray-400 hover:text-blue-400 hover:bg-[#2a2a2a] rounded transition-colors"
                    onClick={(e) => handleEditDeck(deck.id, e)}
                    title="Edit deck"
                    aria-label={`Edit ${deck.name}`}
                    data-testid="deck-edit"
                  >
                    <Pencil size={18} aria-hidden="true" />
                  </button>
                  <button
                    className="px-3 py-2 text-gray-400 hover:text-red-400 hover:bg-[#2a2a2a] rounded transition-colors"
                    onClick={(e) => handleDeleteDeck(deck.id, e)}
                    title="Delete deck"
                    aria-label={`Delete ${deck.name}`}
                    data-testid="deck-delete"
                  >
                    <Trash2 size={18} aria-hidden="true" />
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
            className="bg-[#2a2a2a] border border-[#3d3d3d] text-gray-400 hover:bg-[#3d3d3d] hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImportNew}
            className="bg-blue-500 text-white hover:bg-blue-600"
          >
            Import New Deck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}