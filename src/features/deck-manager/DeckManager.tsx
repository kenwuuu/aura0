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
  /**
   * The deck the import dialog is open on, when it was opened to edit one.
   * `undefined` is a new import — the dialog reads it as the difference between
   * writing a new record and writing over this one.
   */
  const [editingDeck, setEditingDeck] = useState<SavedDeck | undefined>(undefined);

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
    setEditingDeck(undefined);
    onDeckSelected(deck);
  };

  /**
   * An edit is saved, so go back to the list rather than into the game.
   *
   * Deliberately not `onDeckSelected`: editing is a correction, not a choice of
   * what to play. A player who fixes a typo in some other deck mid-game would
   * otherwise have their board reset out from under them by the save. Reopening
   * the list puts them where they can see the change and pick the deck if that
   * is what they actually wanted.
   */
  const handleDeckUpdated = () => {
    setShowImportModal(false);
    setEditingDeck(undefined);
    setSelectionModalOpen(true);
  };

  const handleEditDeck = (deck: SavedDeck) => {
    setSelectionModalOpen(false);
    setEditingDeck(deck);
    setShowImportModal(true);
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
          setEditingDeck(undefined);
          setShowImportModal(true);
        }}
        onEditDeck={handleEditDeck}
      />

      <DeckImportModal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setEditingDeck(undefined);
        }}
        onDeckImported={handleDeckImported}
        editing={editingDeck}
        onDeckUpdated={handleDeckUpdated}
        // Both ways into this dialog come from the deck list, so backing out of
        // it should land there rather than dropping the player into the game.
        onBack={() => {
          setShowImportModal(false);
          setEditingDeck(undefined);
          setSelectionModalOpen(true);
        }}
      />
    </>
  );
}