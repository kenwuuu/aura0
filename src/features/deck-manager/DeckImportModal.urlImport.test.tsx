import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckImportModal } from './DeckImportModal';
import type { ImportedDeck } from './url-import';

/**
 * Pasting a deck link into the import box.
 *
 * `fetch` is the only thing mocked here — it is the I/O boundary, and the point
 * of these tests is what the player sees happen to the textarea, not how the
 * request was made. The endpoint itself is covered against the real Archidekt
 * response in `url-import/archidekt.test.ts`.
 */

const DECK_URL = 'https://archidekt.com/decks/24569510/group_hugs';

const importedDeck: ImportedDeck = {
  name: 'Group hugs',
  source: 'archidekt',
  cards: [
    { name: 'Gluntch, the Bestower', quantity: 1, section: 'commander' },
    { name: 'Sol Ring', quantity: 1, section: 'main' },
    { name: 'Forest', quantity: 12, section: 'main' },
  ],
};

function mockFetchResolving(deck: ImportedDeck) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(deck), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function mockFetchFailing(message: string, status: number) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const deckListBox = () => screen.getByLabelText('Deck List');
const deckNameBox = () => screen.getByLabelText('Deck Name');

async function pasteIntoDeckList(text: string) {
  const user = userEvent.setup();
  await user.click(deckListBox());
  await user.paste(text);
  return user;
}

describe('DeckImportModal — importing from a deck link', () => {
  const onClose = vi.fn();
  const onDeckImported = vi.fn();

  const renderModal = () =>
    render(<DeckImportModal isOpen onClose={onClose} onDeckImported={onDeckImported} />);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces a pasted deck link with the decklist it resolves to', async () => {
    vi.stubGlobal('fetch', mockFetchResolving(importedDeck));
    renderModal();

    await pasteIntoDeckList(DECK_URL);

    await waitFor(() => {
      expect(deckListBox()).toHaveValue(
        'Commander\n1 Gluntch, the Bestower\n\nDeck\n1 Sol Ring\n12 Forest',
      );
    });
  });

  it('asks Aura for the deck rather than the deck site directly', async () => {
    const fetchMock = mockFetchResolving(importedDeck);
    vi.stubGlobal('fetch', fetchMock);
    renderModal();

    await pasteIntoDeckList(DECK_URL);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [requestedUrl] = fetchMock.mock.calls[0];
    expect(requestedUrl).toContain('/api/deck-import?url=');
    expect(requestedUrl).toContain(encodeURIComponent('archidekt.com/decks/24569510'));
  });

  it("names the deck after the source deck when the player hasn't named it", async () => {
    vi.stubGlobal('fetch', mockFetchResolving(importedDeck));
    renderModal();

    await pasteIntoDeckList(DECK_URL);

    await waitFor(() => expect(deckNameBox()).toHaveValue('Group hugs'));
  });

  // A name the player typed is a decision; the source deck's name is only ever a
  // default, so it must not overwrite one.
  it('keeps a name the player already typed', async () => {
    vi.stubGlobal('fetch', mockFetchResolving(importedDeck));
    renderModal();

    const user = userEvent.setup();
    await user.click(deckNameBox());
    await user.paste('My Pod Deck');
    await user.click(deckListBox());
    await user.paste(DECK_URL);

    await waitFor(() => expect(deckListBox()).not.toHaveValue(DECK_URL));
    expect(deckNameBox()).toHaveValue('My Pod Deck');
  });

  it('shows the reason the deck could not be read, and leaves the link in place to retry', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchFailing('That Archidekt deck is private, so we can\'t read it.', 403),
    );
    renderModal();

    await pasteIntoDeckList(DECK_URL);

    expect(await screen.findByText(/that archidekt deck is private/i)).toBeInTheDocument();
    expect(deckListBox()).toHaveValue(DECK_URL);
  });

  // The box normally holds a decklist. Treating that as a URL — or making a
  // request about it — would break the ordinary paste-a-list path.
  it('leaves an ordinary decklist alone', async () => {
    const fetchMock = mockFetchResolving(importedDeck);
    vi.stubGlobal('fetch', fetchMock);
    renderModal();

    const decklist = '1 Sol Ring\n12 Forest';
    await pasteIntoDeckList(decklist);

    expect(deckListBox()).toHaveValue(decklist);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
