import { test, expect } from '../fixtures';
import {
  deckSearchInput,
  deckSelectionModal,
  importDeck,
  openDeckSelection,
  savedDeckRow,
} from '../harness';

/**
 * A second deck on top of the seeded default one, so "filtering" means
 * something: with a single deck in the library every query either shows it or
 * shows nothing, which a broken filter would pass just as happily.
 */
const SECOND_DECK = 'Atraxa Superfriends';

test.beforeEach(async ({ page }) => {
  await importDeck(page, SECOND_DECK, '1 Sol Ring\n99 Island');
});

test('filters the saved-deck list down to the typed name', async ({ page }) => {
  await openDeckSelection(page);
  await expect(savedDeckRow(page, 'Krenko')).toBeVisible();
  await expect(savedDeckRow(page, SECOND_DECK)).toBeVisible();

  await deckSearchInput(page).fill('atraxa');

  await expect(savedDeckRow(page, SECOND_DECK)).toBeVisible();
  await expect(savedDeckRow(page, 'Krenko')).toBeHidden();
});

test('says a query matched nothing, and brings the list back when cleared', async ({ page }) => {
  await openDeckSelection(page);

  await deckSearchInput(page).fill('zzzz');
  await expect(deckSelectionModal(page).getByText('No decks match "zzzz".')).toBeVisible();

  await deckSearchInput(page).fill('');
  await expect(savedDeckRow(page, 'Krenko')).toBeVisible();
  await expect(savedDeckRow(page, SECOND_DECK)).toBeVisible();
});

test('loads the deck a filtered row points at', async ({ page }) => {
  await openDeckSelection(page);

  await deckSearchInput(page).fill('atraxa');
  await savedDeckRow(page, SECOND_DECK).click();

  await expect(deckSelectionModal(page)).toBeHidden();
});

/**
 * Typing into the search box must not double as game input. Every letter here
 * is bound to a board action (`d` draw, `m` mulligan, `s` shuffle), so a search
 * box that leaks keystrokes would quietly reshuffle the game behind the modal.
 */
test('does not fire board hotkeys while typing', async ({ page }) => {
  await openDeckSelection(page);

  await deckSearchInput(page).pressSequentially('dms');

  await expect(deckSearchInput(page)).toHaveValue('dms');
  // A mulligan puts up its own confirmation, which would sit on top of this one.
  await expect(deckSelectionModal(page)).toBeVisible();
  await expect(deckSelectionModal(page).getByText('No decks match "dms".')).toBeVisible();
});

/** A query left behind would hide most of the library the next time it opens. */
test('starts empty each time the modal is opened', async ({ page }) => {
  await openDeckSelection(page);
  await deckSearchInput(page).fill('atraxa');
  await expect(savedDeckRow(page, 'Krenko')).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(deckSelectionModal(page)).toBeHidden();

  await openDeckSelection(page);
  await expect(deckSearchInput(page)).toHaveValue('');
  await expect(savedDeckRow(page, 'Krenko')).toBeVisible();
});
