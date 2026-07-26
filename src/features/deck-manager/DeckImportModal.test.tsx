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

    // 100 in the deck + 1 commander = 101, with a 15-card sideboard beside it.
    await fillForm(
      user,
      ['COMMANDER:', '1 Krenko, Mob Boss', '', '100 Mountain', '', 'Sideboard', '15 Duress'].join('\n'),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // The sideboard is imported, so it is named without the "(not imported)"
    // caveat — and with nothing being dropped, no dropped count is shown.
    expect(
      screen.getByText(/Deck 100 · Command zone 1 · Sideboard 15$/),
    ).toBeInTheDocument();
  });

  it('separates a sideboard it imports from a maybeboard it drops', async () => {
    // Both are withheld from the deck, but only one of them still disappears.
    // Reporting them as one number would tell a player their 3 maybeboard cards
    // are in a sideboard pile they can open — they are not.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderModal();

    await fillForm(
      user,
      ['101 Mountain', '', 'Sideboard', '15 Duress', '', 'Maybeboard', '3 Counterspell'].join('\n'),
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(
      screen.getByText(/Deck 101 · Command zone 0 · Sideboard 15 · 3 not imported/),
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

/**
 * The dialog's half of #174: what a player actually sees when a pasted deck link
 * fails.
 *
 * Driven through the real `fetch` boundary rather than by mocking
 * `fetchImportedDeck`, because the thing under test is the whole chain — the
 * endpoint's reply, the reason it carries, and the fixes rendered from it. A
 * mock at the module seam would still pass with the fixes thrown away in
 * between, which is exactly the bug this is here to prevent.
 */
describe('DeckImportModal — a deck link that fails', () => {
  const onClose = vi.fn();
  const onDeckImported = vi.fn();

  const ARCHIDEKT_LINK = 'https://archidekt.com/decks/24664944';

  const renderModal = () =>
    render(<DeckImportModal isOpen onClose={onClose} onDeckImported={onDeckImported} />);

  /** Reply as the endpoint does for a deck Archidekt won't show us. */
  const endpointReplies = (body: unknown, status: number) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

  const pasteLink = async (link = ARCHIDEKT_LINK) => {
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Deck List'));
    await user.paste(link);
    return user;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads back the endpoint’s explanation and everything worth trying', async () => {
    endpointReplies(
      {
        error: 'Aura couldn’t find that deck on Archidekt.',
        reason: 'deck_not_found',
        fixes: ['Open the link in a new tab.', 'If it opens for you, the deck is private.'],
      },
      404,
    );
    renderModal();

    await pasteLink();

    expect(await screen.findByText('Aura couldn’t find that deck on Archidekt.')).toBeInTheDocument();
    expect(screen.getByText('Open the link in a new tab.')).toBeInTheDocument();
    expect(screen.getByText('If it opens for you, the deck is private.')).toBeInTheDocument();
  });

  /**
   * A failure with no way forward is what sent two players into three identical
   * retries each. The heading is part of the fix: the box has to read as advice,
   * not as a verdict.
   */
  it('offers a way forward rather than a bare error', async () => {
    endpointReplies(
      {
        error: 'Aura couldn’t find that deck on Archidekt.',
        reason: 'deck_not_found',
        fixes: ['Open the link in a new tab.'],
      },
      404,
    );
    renderModal();

    await pasteLink();

    const notice = await screen.findByTestId('deck-import-problem');
    expect(within(notice).getByText(/what to try/i)).toBeInTheDocument();
    expect(within(notice).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  /** A status code is worth quoting in a bug report and worthless as a headline. */
  it('keeps the technical detail out of the sentence a player reads first', async () => {
    endpointReplies(
      {
        error: 'Archidekt is having trouble right now.',
        reason: 'source_unavailable',
        fixes: ['Try again in a few minutes.'],
        detail: 'Archidekt replied with status 503.',
      },
      502,
    );
    renderModal();

    await pasteLink();

    const notice = await screen.findByTestId('deck-import-problem');
    expect(within(notice).getByText('Archidekt is having trouble right now.')).toBeInTheDocument();
    expect(within(notice).getByText('Archidekt replied with status 503.')).toBeInTheDocument();
  });

  /**
   * The player pasted a link, was told the deck was private, fixed it on
   * Archidekt and pasted again. The stale failure must not still be on screen
   * while the second attempt is in flight.
   */
  it('clears a previous failure when a new link is pasted', async () => {
    endpointReplies(
      { error: 'Aura couldn’t find that deck on Archidekt.', reason: 'deck_not_found', fixes: ['x'] },
      404,
    );
    renderModal();
    await pasteLink();
    expect(await screen.findByTestId('deck-import-problem')).toBeInTheDocument();

    endpointReplies({ name: 'Fixed Deck', source: 'archidekt', cards: [] }, 200);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Deck List'));
    await user.click(screen.getByLabelText('Deck List'));
    await user.paste('https://archidekt.com/decks/24665254');

    await waitFor(() =>
      expect(screen.queryByTestId('deck-import-problem')).not.toBeInTheDocument(),
    );
  });

  /**
   * A `TypeError` message is a sentence about our source code. Shown as-is, the
   * player reads our bug as something they did wrong.
   */
  it('never shows an unexpected internal error verbatim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderModal();

    await pasteLink();

    const notice = await screen.findByTestId('deck-import-problem');
    expect(notice).not.toHaveTextContent(/TypeError|Failed to fetch/);
    expect(within(notice).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
