import { describe, it, expect } from 'vitest';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameContextMenu } from './GameContextMenu';
import { useContextMenuStore } from './contextMenuStore';
import { renderWithGame } from '@/test/harness';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';

/**
 * Characterization tests for the new context-menu surface: rows come from
 * `getMenuActionsForTarget`, clicking a row dispatches through
 * `dispatchGameAction` (the same path the keyboard hotkeys use), and the
 * menu closes afterward. See gameActions.test.ts for the executor behavior
 * itself — these tests only cover the menu's own render/dispatch/close wiring.
 */

function makeCard(overrides: Partial<WhiteboardCard> = {}): WhiteboardCard {
  return {
    id: 'card-1',
    cardNumber: 1,
    name: 'Lightning Bolt',
    x: 0,
    y: 0,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    zIndex: 1,
    ownerId: 'test-player',
    ...overrides,
  };
}

describe('GameContextMenu', () => {
  it('renders nothing when closed', () => {
    renderWithGame(<GameContextMenu />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows the battlefield-card rows and dispatches the selected action', async () => {
    const user = userEvent.setup();
    const { yDoc } = renderWithGame(<GameContextMenu />);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    yCards.set('card-1', makeCard());

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'battlefieldCard', id: 'card-1' },
        x: 10,
        y: 10,
      });
    });

    // The row's accessible name is "Tap Space" — label + the shortcut hint.
    const tapItem = await screen.findByRole('menuitem', { name: /^Tap\b/ });
    await user.click(tapItem);

    expect(yCards.get('card-1')!.isTapped).toBe(true);
    expect(useContextMenuStore.getState().isOpen).toBe(false);
  });

  it('renders the destructive action (Delete) with the destructive variant', async () => {
    const { yDoc } = renderWithGame(<GameContextMenu />);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    yCards.set('card-1', makeCard());

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'battlefieldCard', id: 'card-1' },
        x: 10,
        y: 10,
      });
    });

    const deleteItem = await screen.findByRole('menuitem', { name: /^Delete\b/ });
    expect(deleteItem).toHaveAttribute('data-variant', 'destructive');
  });

  it('shows only Delete for a token on desktop right-click — the +1/-1 rows are hidden', async () => {
    renderWithGame(<GameContextMenu />);

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'token', id: 'token-1' },
        x: 10,
        y: 10,
      });
    });

    expect(await screen.findByRole('menuitem', { name: /^Delete token\b/ })).toBeInTheDocument();
    // +1/-1 are `touchMenuOnly`: desktop adjusts the count by clicking the
    // token's top/bottom half, so the menu drops them.
    expect(screen.queryByRole('menuitem', { name: /^\+1\b/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^-1\b/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Tap\b/ })).not.toBeInTheDocument();
  });

  it('keeps the +1/-1 rows for a token when opened via touch', async () => {
    renderWithGame(<GameContextMenu />);

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'token', id: 'token-1' },
        x: 10,
        y: 10,
        viaTouch: true,
      });
    });

    expect(await screen.findByRole('menuitem', { name: /^\+1\b/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^-1\b/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^Delete token\b/ })).toBeInTheDocument();
  });

  it('board menu replaces "-1/-1 counter" with a "Create token" grid item', async () => {
    const user = userEvent.setup();
    renderWithGame(<GameContextMenu />);

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'board', x: 10, y: 10 },
        x: 10,
        y: 10,
      });
    });

    // The drag-to-board token grid took the "-1/-1 counter" slot on the empty
    // board menu; the "+1/+1" ("Counter") row is untouched.
    const createToken = await screen.findByRole('menuitem', { name: /^Create token\b/ });
    expect(screen.getByRole('menuitem', { name: /^Counter\b/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /-1\/-1 counter/ })).not.toBeInTheDocument();

    // It hosts the same drag-to-board grid as the toolbar's Create ▾ menu.
    await user.click(createToken);
    expect(await screen.findByText(/drag a token onto the board/i)).toBeInTheDocument();
  });
});
