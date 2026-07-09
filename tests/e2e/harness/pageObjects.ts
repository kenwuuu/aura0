import { Page, Locator } from '@playwright/test';
import { TESTID, PileKind } from './selectors';

/** All battlefield card nodes. */
export function boardCards(page: Page): Locator {
  return page.locator(`[data-testid="${TESTID.battlefieldCard}"]`);
}

/** A battlefield card node. Pass `id` to target a specific card; omit for "the first one". */
export function boardCard(page: Page, id?: string): Locator {
  if (id) return page.locator(`[data-testid="${TESTID.battlefieldCard}"][data-card-id="${id}"]`);
  return boardCards(page).first();
}

/** All battlefield token nodes. */
export function boardTokens(page: Page): Locator {
  return page.locator(`[data-testid="${TESTID.battlefieldToken}"]`);
}

/** A battlefield token node. Pass `id` to target a specific token; omit for "the first one". */
export function boardToken(page: Page, id?: string): Locator {
  if (id) return page.locator(`[data-testid="${TESTID.battlefieldToken}"][data-token-id="${id}"]`);
  return boardTokens(page).first();
}

/** A resource pile node (deck / discard / exile / hand) for a given owner. Defaults to the local player. */
export function pileTile(page: Page, kind: PileKind, ownerId?: string): Locator {
  const owner = ownerId ? `[data-pile-owner="${ownerId}"]` : '';
  return page.locator(`[data-testid="${TESTID.pile}"][data-pile-type="${kind}"]${owner}`);
}

/** The pile's count readout — `data-pile-count` lives on this nested node, not the pile tile root. */
export function pileCount(page: Page, kind: PileKind, ownerId?: string): Locator {
  return pileTile(page, kind, ownerId).locator('.pile-count');
}

/** All hand cards for the local player. */
export function handCards(page: Page): Locator {
  return page.locator(`[data-testid="${TESTID.handCard}"]`);
}

/** A hand card. Pass `id` to target a specific card; omit for "the first one". */
export function handCard(page: Page, id?: string): Locator {
  if (id) return page.locator(`[data-testid="${TESTID.handCard}"][data-card-id="${id}"]`);
  return handCards(page).first();
}

/** All health-value inputs currently on the board (one per seated player). */
export function healthInputs(page: Page): Locator {
  return page.locator(`[data-testid="${TESTID.healthValue}"]`);
}

/** The local player's health input. Assert with `toHaveValue('40')`. */
export function healthInput(page: Page): Locator {
  return healthInputs(page).first();
}

/** The pile-viewer modal, optionally scoped to a specific pile type. */
export function pileViewer(page: Page, pileType?: PileKind | 'scry'): Locator {
  const type = pileType ? `[data-pile-type="${pileType}"]` : '';
  return page.locator(`[data-testid="${TESTID.pileViewer}"]${type}`);
}

/** All cards rendered inside an open pile viewer. */
export function pileViewerCards(page: Page): Locator {
  return page.locator(`[data-testid="${TESTID.pileViewerCard}"]`);
}

/** A specific card inside an open pile viewer. */
export function pileViewerCard(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${TESTID.pileViewerCard}"][data-card-id="${id}"]`);
}

/** The pile-viewer's card grid (carries the `data-rendering-complete` batch-render signal). */
export function pileViewerGrid(page: Page): Locator {
  return page.locator('.deck-pile-viewer-grid');
}

/** The "Choose Deck" trigger button. */
export function deckImportOpenButton(page: Page): Locator {
  return page.getByTestId(TESTID.deckImportOpen);
}

/** The deck import modal. */
export function deckImportModal(page: Page): Locator {
  return page.getByTestId(TESTID.deckImportModal);
}

/** The react-flow whiteboard surface (drop target for drags). */
export function whiteboard(page: Page): Locator {
  return page.locator('#whiteboard');
}

/** The Create ▾ > Token popover hosting the draggable KeywordTokenGrid. */
export function tokenGrid(page: Page): Locator {
  return page.locator('[data-slot="popover-content"]').filter({ hasText: 'Drag a token onto the board' });
}

/** Draggable token templates inside the {@link tokenGrid} drawer. */
export function tokenGridItems(page: Page): Locator {
  return tokenGrid(page).locator('div[draggable="true"]');
}

/** The top menu bar. */
export function toolbar(page: Page): Locator {
  return page.getByTestId(TESTID.toolbar);
}

/** The "⋯ More" overflow trigger, visible only below the toolbar's `sm` collapse breakpoint. */
export function toolbarMoreButton(page: Page): Locator {
  return page.getByTestId(TESTID.toolbarMore);
}

/** The "Hotkeys" button in the top bar. Hidden below the `sm` collapse breakpoint. */
export function hotkeysButton(page: Page): Locator {
  return toolbar(page).getByRole('button', { name: 'Hotkeys' });
}

/** The "Help" button in the top bar (desktop row; moves into the overflow menu on phone). */
export function helpButton(page: Page): Locator {
  return toolbar(page).getByRole('button', { name: 'Help' });
}

/** The Discord button in the top bar (desktop row; moves into the overflow menu on phone). */
export function discordButton(page: Page): Locator {
  return toolbar(page).getByRole('button', { name: 'Join Discord Server' });
}

/** The room connection-status indicator (dot + label). */
export function connectionStatus(page: Page): Locator {
  return page.getByTestId(TESTID.connectionStatus);
}

/** The "copy room link" button. */
export function roomLinkButton(page: Page): Locator {
  return page.getByTestId(TESTID.roomLink);
}

/** The "new game" button that opens a fresh room. */
export function newGameButton(page: Page): Locator {
  return page.getByTestId(TESTID.newGameButton);
}
