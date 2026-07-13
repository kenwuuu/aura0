import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckImportModal } from './DeckImportModal';
import { MtgTextListDeckImporter } from '@/features/deck-manager';
import { DeckStorageService } from '@/infrastructure/persistence';
import type { DeckImportResult } from './DeckImporter';

// The import-flow describe block below mocks these two I/O boundary classes
// (network card lookup + IndexedDB). Hoisted here so it applies file-wide —
// harmless for the Help-dialog/validation tests, which never construct them.
// Per tests/testing-react.md, mock only the I/O a test actually exercises
// (and via the `@/` alias, never a relative path).
//
// Mocked at the barrel path DeckImportModal.tsx itself imports from (not the
// concrete submodule): src/test/setup.ts loads useGameInstance globally,
// which imports DeckPersistenceService from the same `@/infrastructure/
// persistence` barrel, pre-caching the real DeckStorageService module before
// this file's mocks could apply to it. importOriginal preserves every other
// barrel export (like DeckPersistenceService) as the real thing.
vi.mock('@/features/deck-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/deck-manager')>()),
  MtgTextListDeckImporter: vi.fn(),
}));
vi.mock('@/infrastructure/persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infrastructure/persistence')>()),
  DeckStorageService: vi.fn(),
}));

// Helpers that name what the user is looking at, so the intent survives refactors.
const importDialogHeading = () => screen.getByRole('heading', { name: 'Import Deck' });
const queryImportDialogHeading = () => screen.queryByRole('heading', { name: 'Import Deck' });
const helpDialog = () => screen.getByRole('dialog', { name: /deck import guide/i });
const queryHelpGuide = () => screen.queryByText('Deck Import Guide');

describe('DeckImportModal — Help dialog integration', () => {
  const onClose = vi.fn();
  const onDeckImported = vi.fn();

  const renderModal = () =>
    render(<DeckImportModal isOpen onClose={onClose} onDeckImported={onDeckImported} />);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render the modal when closed', () => {
    render(<DeckImportModal isOpen={false} onClose={onClose} onDeckImported={onDeckImported} />);
    expect(queryImportDialogHeading()).not.toBeInTheDocument();
  });

  it('renders the modal when open', () => {
    renderModal();
    expect(importDialogHeading()).toBeInTheDocument();
  });

  it('exposes a Help button', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('opens the Help dialog when Help is clicked', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));

    expect(screen.getByText('Deck Import Guide')).toBeInTheDocument();
  });

  it('keeps the import modal open while the Help dialog is open', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));

    // Radix marks the backgrounded modal aria-hidden while a nested dialog is
    // open, so it drops out of the accessibility tree (role/name queries can't
    // see it). Its label-associated form field stays in the DOM regardless, so
    // it's the stable proof the import modal is still mounted and not dismissed.
    expect(screen.getByText('Deck Import Guide')).toBeInTheDocument();
    expect(screen.getByLabelText('Deck Name')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the import modal open after closing Help via "Got it"', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));
    await user.click(within(helpDialog()).getByRole('button', { name: /got it/i }));

    await waitFor(() => expect(queryHelpGuide()).not.toBeInTheDocument());
    expect(importDialogHeading()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the import modal open after closing Help via the × button', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));
    await user.click(within(helpDialog()).getByRole('button', { name: '×' }));

    await waitFor(() => expect(queryHelpGuide()).not.toBeInTheDocument());
    expect(importDialogHeading()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the guide content in the Help dialog', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));
    const guide = within(helpDialog());

    expect(guide.getByText('Recommended Format')).toBeInTheDocument();
    expect(guide.getByText('Section Headers')).toBeInTheDocument();
    expect(guide.getByText('Supported Formats')).toBeInTheDocument();
    expect(guide.getByText(/MTGO preset/i)).toBeInTheDocument();
    // The section-header explanation, plus a string unique to the code sample.
    expect(guide.getByText(/commander and main deck import/i)).toBeInTheDocument();
    expect(guide.getByText(/Zuran Orb/)).toBeInTheDocument();
  });

  it('allows reopening the Help dialog after closing it', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByText('Deck Import Guide')).toBeInTheDocument();

    await user.click(within(helpDialog()).getByRole('button', { name: /got it/i }));
    await waitFor(() => expect(queryHelpGuide()).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByText('Deck Import Guide')).toBeInTheDocument();
  });
});

describe('DeckImportModal — form validation', () => {
  const onClose = vi.fn();
  const onDeckImported = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = () =>
    render(<DeckImportModal isOpen onClose={onClose} onDeckImported={onDeckImported} />);

  it('disables Import Deck until both a name and a deck list are provided', async () => {
    const user = userEvent.setup();
    renderModal();

    const importButton = screen.getByRole('button', { name: 'Import Deck' });
    expect(importButton).toBeDisabled();

    await user.type(screen.getByLabelText('Deck Name'), 'My Deck');
    expect(importButton).toBeDisabled();

    await user.type(screen.getByLabelText('Deck List'), '1 Sol Ring');
    expect(importButton).toBeEnabled();
  });

  it('leaves Deck Name/Deck List/Cancel enabled before an import starts', () => {
    renderModal();

    expect(screen.getByLabelText('Deck Name')).toBeEnabled();
    expect(screen.getByLabelText('Deck List')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});

describe('DeckImportModal — import flow', () => {
  const onClose = vi.fn();
  const onDeckImported = vi.fn();

  // Deferred so tests control exactly when the mocked importer "resolves",
  // letting progress/success states be observed instead of racing past them.
  let resolveImport: (result: DeckImportResult) => void;
  let rejectImport: (error: unknown) => void;
  let capturedOnProgress: ((current: number, total: number) => void) | undefined;
  const saveDeckMock = vi.fn();
  const importFromTextMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    saveDeckMock.mockResolvedValue(undefined);
    importFromTextMock.mockImplementation(
      () =>
        new Promise<DeckImportResult>((resolve, reject) => {
          resolveImport = resolve;
          rejectImport = reject;
        }),
    );
    // Regular `function`, not an arrow — production code calls these via
    // `new`, and arrow functions have no [[Construct]] and throw when `new`ed.
    vi.mocked(MtgTextListDeckImporter).mockImplementation(function (onProgress) {
      capturedOnProgress = onProgress;
      return { importFromText: importFromTextMock } as any;
    });
    vi.mocked(DeckStorageService).mockImplementation(function () {
      return { saveDeck: saveDeckMock } as any;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderModal = () =>
    render(<DeckImportModal isOpen onClose={onClose} onDeckImported={onDeckImported} />);

  // The size warning now reads the *text*, not the import result — it fires
  // before a single card is looked up. So what a test types is what it means.
  const LEGAL_60 = '60 Mountain';
  const UNUSUAL_101 = '101 Mountain';

  async function fillForm(user: ReturnType<typeof userEvent.setup>, list = LEGAL_60) {
    await user.type(screen.getByLabelText('Deck Name'), 'My Deck');
    await user.type(screen.getByLabelText('Deck List'), list);
  }

  async function startImport(user: ReturnType<typeof userEvent.setup>, list = LEGAL_60) {
    await fillForm(user, list);
    await user.click(screen.getByRole('button', { name: 'Import Deck' }));
  }

  it('shows fetch progress reported by the importer', async () => {
    const user = userEvent.setup();
    renderModal();
    await startImport(user);

    act(() => capturedOnProgress?.(1, 2));
    expect(screen.getByText('Fetching card 1 of 2...')).toBeInTheDocument();

    act(() => capturedOnProgress?.(2, 2));
    expect(screen.getByText('Fetching card 2 of 2...')).toBeInTheDocument();
  });

  /** A deck of `size` distinct cards — the modal only ever counts them. */
  const deckOf = (size: number) =>
    Array.from({ length: size }, (_, i) => ({ id: `c${i}`, name: `Card ${i}` })) as any[];

  it('saves the deck, shows a success message, and hands off the imported deck after the delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    renderModal();
    await startImport(user);

    // A legal 60-card deck: the import should go straight through without
    // stopping to ask about its size.
    const cards = deckOf(60);
    await act(async () => {
      resolveImport({ cards, metadata: { name: 'My Deck' } });
      // Flush the microtasks queued by the awaited importFromText/saveDeck calls.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Successfully imported 60 cards!')).toBeInTheDocument();
    expect(screen.queryByText(/unusual deck size/i)).not.toBeInTheDocument();
    expect(saveDeckMock).toHaveBeenCalledWith(
      expect.objectContaining({ cards, metadata: expect.objectContaining({ name: 'My Deck' }) }),
    );
    expect(onDeckImported).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));

    expect(onDeckImported).toHaveBeenCalledWith(expect.objectContaining({ cards }));
    expect(onClose).toHaveBeenCalled();
  });

  it('imports a 100-card Commander deck without questioning its size', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    renderModal();
    await startImport(user, '100 Mountain');

    await act(async () => {
      resolveImport({ cards: deckOf(100), metadata: {} });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('heading', { name: /unusual deck size/i })).not.toBeInTheDocument();
    expect(saveDeckMock).toHaveBeenCalled();
  });

  it('warns about an unusual size once the list settles, without being asked to import', async () => {
    // The point of the debounce: the player learns their list is 101 cards while
    // they are still looking at it, not after a 12-54 second lookup.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    renderModal();
    await fillForm(user, UNUSUAL_101);

    expect(screen.queryByRole('heading', { name: /unusual deck size/i })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('heading', { name: /unusual deck size/i })).toBeInTheDocument();
    expect(screen.getByText(/this list comes to 101 cards/i)).toBeInTheDocument();

    // Purely a read of the text — nothing was imported to produce it.
    expect(importFromTextMock).not.toHaveBeenCalled();
    expect(saveDeckMock).not.toHaveBeenCalled();
  });

  it('shows where the cards went, section by section', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    renderModal();

    // 100 in the deck + 1 commander = 101, with a 15-card sideboard dropped.
    await fillForm(
      user,
      ['COMMANDER:', '1 Krenko, Mob Boss', '', '100 Mountain', '', 'Sideboard', '15 Duress'].join('\n'),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(
      screen.getByText(/Deck 100 · Command zone 1 · Sideboard 15 \(not imported\)/),
    ).toBeInTheDocument();
  });

  it('does not let a fast paste-and-click slip past the warning', async () => {
    // Clicking Import before the debounce has fired must not import in silence:
    // the list is re-read on the spot and the warning shown instead.
    const user = userEvent.setup();
    renderModal();
    await startImport(user, UNUSUAL_101);

    expect(screen.getByRole('heading', { name: /unusual deck size/i })).toBeInTheDocument();
    expect(importFromTextMock).not.toHaveBeenCalled();
    expect(saveDeckMock).not.toHaveBeenCalled();
  });

  it('imports the unusual deck when the player clicks through the warning', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    renderModal();
    await startImport(user, UNUSUAL_101);

    // The warning is up and the button now says what it will do.
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Import Anyway' }));
    });

    const cards = deckOf(101);
    await act(async () => {
      resolveImport({ cards, metadata: {} });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveDeckMock).toHaveBeenCalledWith(expect.objectContaining({ cards }));

    act(() => vi.advanceTimersByTime(1000));
    expect(onDeckImported).toHaveBeenCalledWith(expect.objectContaining({ cards }));
  });

  it("shows the importer's reported errors and never hands off a deck", async () => {
    const user = userEvent.setup();
    renderModal();
    await startImport(user);

    await act(async () => {
      resolveImport({ cards: [], metadata: {}, errors: ['Unknown card: Not A Real Card'] });
    });

    expect(screen.getByText('Unknown card: Not A Real Card')).toBeInTheDocument();
    expect(saveDeckMock).not.toHaveBeenCalled();
    expect(onDeckImported).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Import Deck' })).toBeEnabled();
  });

  it('shows a fallback error when no cards could be parsed at all', async () => {
    const user = userEvent.setup();
    renderModal();
    await startImport(user);

    await act(async () => {
      resolveImport({ cards: [], metadata: {} });
    });

    expect(
      screen.getByText('No cards could be imported. Please check your deck list format.'),
    ).toBeInTheDocument();
    expect(saveDeckMock).not.toHaveBeenCalled();
  });

  it('surfaces a thrown import error and re-enables the form', async () => {
    const user = userEvent.setup();
    renderModal();
    await startImport(user);

    await act(async () => {
      rejectImport(new Error('Network unreachable'));
    });

    expect(screen.getByText('Network unreachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import Deck' })).toBeEnabled();
    expect(onDeckImported).not.toHaveBeenCalled();
  });

  it('Cancel clears the form and closes without importing', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Deck Name'), 'My Deck');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(importFromTextMock).not.toHaveBeenCalled();
  });

  it('disables Deck Name/Deck List/Cancel while an import is in flight', async () => {
    const user = userEvent.setup();
    renderModal();
    await startImport(user);

    expect(screen.getByLabelText('Deck Name')).toBeDisabled();
    expect(screen.getByLabelText('Deck List')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Importing...' })).toBeDisabled();
  });
});
