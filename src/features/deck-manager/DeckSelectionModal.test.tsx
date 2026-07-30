import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckSelectionModal } from './DeckSelectionModal';
import { DeckStorageService } from '@/infrastructure/persistence';
import type { DeckMetadata, SavedDeck } from '@/features/player/types';

// IndexedDB is the one I/O boundary this component touches. Mocked at the barrel
// path the component imports from — see DeckImportModal.test.tsx for why.
vi.mock('@/infrastructure/persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infrastructure/persistence')>()),
  DeckStorageService: vi.fn(),
}));

describe('DeckSelectionModal', () => {
  const onClose = vi.fn();
  const onDeckSelected = vi.fn();
  const onImportNewDeck = vi.fn();
  const onEditDeck = vi.fn();

  const getAllDeckMetadata = vi.fn();
  const getDeck = vi.fn();
  const deleteDeck = vi.fn();

  const metadata: DeckMetadata = {
    id: 'deck-1',
    name: 'Mono Red',
    source: 'scryfall',
    cardCount: 60,
    importedAt: new Date('2026-01-01T00:00:00Z'),
    lastModified: new Date('2026-01-02T00:00:00Z'),
  };
  const otherMetadata: DeckMetadata = {
    id: 'deck-2',
    name: 'Atraxa Superfriends',
    format: 'Commander',
    source: 'moxfield',
    cardCount: 100,
    importedAt: new Date('2026-01-03T00:00:00Z'),
    lastModified: new Date('2026-01-04T00:00:00Z'),
  };
  const fullDeck = { metadata, cards: [], decklistText: 'Deck\n60 Mountain' } as SavedDeck;

  beforeEach(() => {
    vi.clearAllMocks();
    getAllDeckMetadata.mockResolvedValue([metadata]);
    getDeck.mockResolvedValue(fullDeck);
    deleteDeck.mockResolvedValue(undefined);
    // Regular `function`, not an arrow — production constructs this with `new`.
    vi.mocked(DeckStorageService).mockImplementation(function () {
      return { getAllDeckMetadata, getDeck, deleteDeck } as any;
    });
  });

  const renderModal = (isOpen = true) =>
    render(
      <DeckSelectionModal
        isOpen={isOpen}
        onClose={onClose}
        onDeckSelected={onDeckSelected}
        onImportNewDeck={onImportNewDeck}
        onEditDeck={onEditDeck}
      />,
    );

  const editButton = () => screen.getByRole('button', { name: 'Edit Mono Red' });

  it('offers a way to edit each saved deck', async () => {
    renderModal();

    expect(await screen.findByText('Mono Red')).toBeInTheDocument();
    expect(editButton()).toBeInTheDocument();
  });

  it('hands the whole deck to the editor, cards and all', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Mono Red');

    await user.click(editButton());

    // Metadata alone would open an editor with an empty box, so the full record
    // has to be fetched first.
    await waitFor(() => expect(onEditDeck).toHaveBeenCalledWith(fullDeck));
  });

  it('does not also load the deck into the game', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Mono Red');

    await user.click(editButton());

    // Editing sits inside the row that loads a deck. Without the click being
    // stopped there, correcting a typo would reset the board too.
    await waitFor(() => expect(onEditDeck).toHaveBeenCalled());
    expect(onDeckSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still loads the deck when the row itself is clicked', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByText('Mono Red'));

    await waitFor(() => expect(onDeckSelected).toHaveBeenCalledWith(fullDeck));
    expect(onEditDeck).not.toHaveBeenCalled();
  });

  it('says so rather than opening an empty editor when the deck has gone missing', async () => {
    getDeck.mockResolvedValue(null);
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Mono Red');

    await user.click(editButton());

    expect(await screen.findByText('Deck not found')).toBeInTheDocument();
    expect(onEditDeck).not.toHaveBeenCalled();
  });

  describe('search', () => {
    const searchBox = () => screen.getByRole('searchbox', { name: 'Search decks' });

    beforeEach(() => {
      getAllDeckMetadata.mockResolvedValue([metadata, otherMetadata]);
    });

    it('narrows the list to decks matching the query', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByText('Mono Red');

      await user.type(searchBox(), 'atraxa');

      expect(screen.getByText('Atraxa Superfriends')).toBeInTheDocument();
      expect(screen.queryByText('Mono Red')).not.toBeInTheDocument();
    });

    it('matches on the deck name alone, not the format or source beside it', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByText('Mono Red');

      // "Commander" is deck 2's format and "moxfield" its source. Both are on
      // the row, but neither is what the deck is called — searching by them
      // would turn a format filter into a name filter's silent side effect.
      await user.type(searchBox(), 'commander');
      expect(screen.getByText(/No decks match/)).toBeInTheDocument();

      await user.clear(searchBox());
      await user.type(searchBox(), 'moxfield');
      expect(screen.getByText(/No decks match/)).toBeInTheDocument();
    });

    it('says the query matched nothing rather than looking like an empty library', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByText('Mono Red');

      await user.type(searchBox(), 'zzzz');

      expect(screen.getByText('No decks match "zzzz".')).toBeInTheDocument();
      // The first-run prompt would be a lie here — there are decks, just hidden.
      expect(screen.queryByText(/Import your first deck/)).not.toBeInTheDocument();
    });

    it('still loads the deck a filtered row points at', async () => {
      const user = userEvent.setup();
      getDeck.mockResolvedValue({ ...fullDeck, metadata: otherMetadata });
      renderModal();
      await screen.findByText('Mono Red');

      await user.type(searchBox(), 'atraxa');
      await user.click(screen.getByText('Atraxa Superfriends'));

      await waitFor(() => expect(getDeck).toHaveBeenCalledWith('deck-2'));
      expect(onDeckSelected).toHaveBeenCalled();
    });

    it('clears the query when the modal is reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = renderModal();
      await screen.findByText('Mono Red');

      await user.type(searchBox(), 'atraxa');
      expect(screen.queryByText('Mono Red')).not.toBeInTheDocument();

      // Reopening on a stale query would hide most of the library with nothing
      // on screen to explain why.
      const props = {
        onClose,
        onDeckSelected,
        onImportNewDeck,
        onEditDeck,
      };
      rerender(<DeckSelectionModal isOpen={false} {...props} />);
      rerender(<DeckSelectionModal isOpen {...props} />);

      expect(await screen.findByText('Mono Red')).toBeInTheDocument();
      expect(searchBox()).toHaveValue('');
    });

    it('offers no search box when there is nothing to search', async () => {
      getAllDeckMetadata.mockResolvedValue([]);
      renderModal();

      expect(await screen.findByText(/Import your first deck/)).toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });
  });
});
