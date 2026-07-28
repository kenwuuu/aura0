import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckImportModal } from './DeckImportModal';
import { MtgTextListDeckImporter } from '@/features/deck-manager';
import { DeckStorageService } from '@/infrastructure/persistence';
import type { DeckImportResult } from './DeckImporter';
import type { Card, SavedDeck } from '@/features/player/types';

// Same two I/O boundaries the sibling import-flow suite mocks, for the same
// reasons (network card lookup + IndexedDB), mocked at the barrel path this
// component imports from. See DeckImportModal.test.tsx for why the barrel and
// not the concrete submodule.
vi.mock('@/features/deck-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/deck-manager')>()),
  MtgTextListDeckImporter: vi.fn(),
}));
vi.mock('@/infrastructure/persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infrastructure/persistence')>()),
  DeckStorageService: vi.fn(),
}));

describe('DeckImportModal — editing a saved deck', () => {
  const onClose = vi.fn();
  const onDeckImported = vi.fn();
  const onDeckUpdated = vi.fn();
  const saveDeckMock = vi.fn();
  const importFromTextMock = vi.fn();
  let resolveImport: (result: DeckImportResult) => void;

  const IMPORTED_AT = new Date('2026-01-01T00:00:00Z');

  const cards = (count: number, name: string): Card[] =>
    Array.from({ length: count }, (_, i) => ({ id: `c${i}`, name })) as Card[];

  /** A deck as it sits in storage: 60 Mountain, saved from that exact list. */
  const savedDeck = (overrides: Partial<SavedDeck> = {}): SavedDeck =>
    ({
      metadata: {
        id: 'deck-original-id',
        name: 'Mono Red',
        source: 'scryfall',
        cardCount: 60,
        importedAt: IMPORTED_AT,
        lastModified: IMPORTED_AT,
      },
      cards: cards(60, 'Mountain'),
      decklistText: 'Deck\n60 Mountain',
      ...overrides,
    }) as SavedDeck;

  beforeEach(() => {
    vi.clearAllMocks();
    saveDeckMock.mockResolvedValue(undefined);
    importFromTextMock.mockImplementation(
      () => new Promise<DeckImportResult>((resolve) => { resolveImport = resolve; }),
    );
    // Regular `function`, not an arrow — production constructs these with `new`.
    vi.mocked(MtgTextListDeckImporter).mockImplementation(function () {
      return { importFromText: importFromTextMock } as any;
    });
    vi.mocked(DeckStorageService).mockImplementation(function () {
      return { saveDeck: saveDeckMock } as any;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderEditing = (deck: SavedDeck = savedDeck()) =>
    render(
      <DeckImportModal
        isOpen
        onClose={onClose}
        onDeckImported={onDeckImported}
        onDeckUpdated={onDeckUpdated}
        editing={deck}
      />,
    );

  const listBox = () => screen.getByLabelText('Deck List') as HTMLTextAreaElement;
  const nameBox = () => screen.getByLabelText('Deck Name') as HTMLInputElement;
  const saveButton = () => screen.getByRole('button', { name: 'Save Changes' });

  /** Let the awaited save (and the import before it, if any) settle. */
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it('opens on the deck being edited rather than an empty form', () => {
    renderEditing();

    expect(nameBox()).toHaveValue('Mono Red');
    expect(listBox()).toHaveValue('Deck\n60 Mountain');
  });

  it('says it is editing, not importing', () => {
    renderEditing();

    expect(screen.getByRole('heading', { name: 'Edit Deck' })).toBeInTheDocument();
    expect(saveButton()).toBeInTheDocument();
  });

  it('starts empty when opened to import a new deck instead', () => {
    render(<DeckImportModal isOpen onClose={onClose} onDeckImported={onDeckImported} />);

    expect(nameBox()).toHaveValue('');
    expect(listBox()).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Import Deck' })).toBeInTheDocument();
  });

  it('writes over the deck it opened rather than creating a second one', async () => {
    const user = userEvent.setup();
    renderEditing();

    await user.clear(listBox());
    await user.type(listBox(), '60 Forest');
    await user.click(saveButton());

    const imported = cards(60, 'Forest');
    await act(async () => {
      resolveImport({ cards: imported, metadata: {} });
      await flush();
    });

    expect(saveDeckMock).toHaveBeenCalledTimes(1);
    expect(saveDeckMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: imported,
        metadata: expect.objectContaining({ id: 'deck-original-id', name: 'Mono Red' }),
      }),
    );
  });

  it('keeps when the deck first arrived, and records that it changed just now', async () => {
    const user = userEvent.setup();
    renderEditing();

    await user.clear(listBox());
    await user.type(listBox(), '60 Forest');
    await user.click(saveButton());

    await act(async () => {
      resolveImport({ cards: cards(60, 'Forest'), metadata: {} });
      await flush();
    });

    const { metadata } = saveDeckMock.mock.calls[0][0] as SavedDeck;
    expect(metadata.importedAt).toEqual(IMPORTED_AT);
    expect(metadata.lastModified.getTime()).toBeGreaterThan(IMPORTED_AT.getTime());
  });

  it('saves the edited list so the next edit reopens what was actually saved', async () => {
    const user = userEvent.setup();
    renderEditing();

    await user.clear(listBox());
    await user.type(listBox(), '60 Forest');
    await user.click(saveButton());

    await act(async () => {
      resolveImport({ cards: cards(60, 'Forest'), metadata: {} });
      await flush();
    });

    expect((saveDeckMock.mock.calls[0][0] as SavedDeck).decklistText).toBe('60 Forest');
  });

  it('hands the deck back as an update, never as a deck to load into the game', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    renderEditing();

    await user.clear(listBox());
    await user.type(listBox(), '60 Forest');
    await user.click(saveButton());

    await act(async () => {
      resolveImport({ cards: cards(60, 'Forest'), metadata: {} });
      await flush();
    });
    act(() => vi.advanceTimersByTime(1000));

    expect(onDeckUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ id: 'deck-original-id' }) }),
    );
    expect(onDeckImported).not.toHaveBeenCalled();
  });

  describe('when the list was left alone', () => {
    it('renames without putting a working deck back through the lookup', async () => {
      const user = userEvent.setup();
      renderEditing();

      await user.clear(nameBox());
      await user.type(nameBox(), 'Big Red');
      await user.click(saveButton());
      await act(flush);

      // The cards are already resolved — re-importing them could only lose some.
      expect(importFromTextMock).not.toHaveBeenCalled();
      expect(saveDeckMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cards: savedDeck().cards,
          metadata: expect.objectContaining({ id: 'deck-original-id', name: 'Big Red' }),
        }),
      );
    });

    it('keeps the saved list rather than rewriting it', async () => {
      const user = userEvent.setup();
      renderEditing();

      await user.clear(nameBox());
      await user.type(nameBox(), 'Big Red');
      await user.click(saveButton());
      await act(flush);

      expect((saveDeckMock.mock.calls[0][0] as SavedDeck).decklistText).toBe('Deck\n60 Mountain');
    });

    it('does not treat an unusual deck size as a reason to re-ask', async () => {
      const user = userEvent.setup();
      // 61 cards: a size the import flow would stop and question.
      renderEditing(
        savedDeck({ cards: cards(61, 'Mountain'), decklistText: 'Deck\n61 Mountain' }),
      );

      await user.clear(nameBox());
      await user.type(nameBox(), 'Big Red');
      await user.click(saveButton());
      await act(flush);

      // The player already accepted this size when they imported it; a rename is
      // not a new chance to have got it wrong.
      expect(saveDeckMock).toHaveBeenCalledTimes(1);
    });
  });

  it('rebuilds a list for a deck saved before decklists were kept', () => {
    const legacy = savedDeck();
    delete (legacy as Partial<SavedDeck>).decklistText;

    renderEditing(legacy);

    expect(listBox()).toHaveValue('Deck\n60 Mountain');
  });
});
