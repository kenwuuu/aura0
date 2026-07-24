import React, { useState } from 'react';
import { DeckImportModal } from './DeckImportModal';
import { DeckSelectionModal } from './DeckSelectionModal';
import { SavedDeck } from '@/features/player/types';
import { useOverlayStore } from '@/app/stores/overlayStore';

interface DeckManagerProps {
  onDeckSelected: (deck: SavedDeck) => void;
}

export function DeckManager({ onDeckSelected }: DeckManagerProps) {
  // Selection-modal open state lives in the overlay store so the command
  // palette's "Import a deck" command can open it too (the import modal stays
  // internal — it's only ever reached from the selection modal).
  const showSelectionModal = useOverlayStore((s) => s.deckSelectionOpen);
  const setSelectionModalOpen = (open: boolean) =>
    useOverlayStore.getState().set('deckSelection', open);
  const [showImportModal, setShowImportModal] = useState(false);

  const handleOpenSelection = () => {
    setSelectionModalOpen(true);
  };

  // No analytics here on purpose. The importer owns the import funnel end to end
  // (`deck_import_started` → `…_succeeded` / `…_partial_failure` / `…_failed` /
  // `…_abandoned`). The old `deck_imported` event fired from this UI layer and was
  // an exact duplicate of `deck_import_succeeded` — the modal refuses to hand a
  // deck back when any card failed — so it only ever double-counted successes.
  const handleDeckImported = (deck: SavedDeck) => {
    setShowImportModal(false);
    onDeckSelected(deck);
  };

  const handleDeckSelected = (deck: SavedDeck) => {
    setSelectionModalOpen(false);
    onDeckSelected(deck);
  };

  return (
    <>
      <button className="toolbar-button primary" data-testid="deck-import-open" onClick={handleOpenSelection}>
        📚 <span className="toolbar-deck-label-full">Choose Deck</span>
        <span className="toolbar-deck-label-short">Deck</span>
      </button>

      <DeckSelectionModal
        isOpen={showSelectionModal}
        onClose={() => setSelectionModalOpen(false)}
        onDeckSelected={handleDeckSelected}
        onImportNewDeck={() => {
          setSelectionModalOpen(false);
          setShowImportModal(true);
        }}
      />

      <DeckImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onDeckImported={handleDeckImported}
      />
    </>
  );
}