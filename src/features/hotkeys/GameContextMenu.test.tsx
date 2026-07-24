import { describe, it, expect, vi } from 'vitest';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameContextMenu } from './GameContextMenu';
import { useContextMenuStore } from './contextMenuStore';
import { HotkeyContext } from './hotkeys';
import { usePileViewerHotkeyStore } from '@/features/game-dock/pileViewerHotkeyStore';
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

  it('shows a Peek row on your own hidden facedown card when opened via touch', async () => {
    const { yDoc } = renderWithGame(<GameContextMenu />);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    yCards.set('card-1', makeCard({ isFlipped: true, ownerId: 'test-player' }));

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'battlefieldCard', id: 'card-1' },
        x: 10,
        y: 10,
        viaTouch: true,
      });
    });

    expect(await screen.findByRole('menuitem', { name: /^Peek\b/ })).toBeInTheDocument();
  });

  it('hides the Peek row on desktop right-click — desktop auto-peeks on hover instead', async () => {
    const { yDoc } = renderWithGame(<GameContextMenu />);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    yCards.set('card-1', makeCard({ isFlipped: true, ownerId: 'test-player' }));

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'battlefieldCard', id: 'card-1' },
        x: 10,
        y: 10,
        // no viaTouch → desktop right-click; Peek is touchMenuOnly.
      });
    });

    await screen.findByRole('menuitem', { name: /^Tap\b/ });
    expect(screen.queryByRole('menuitem', { name: /^Peek\b/ })).not.toBeInTheDocument();
  });

  it('hides the Peek row on a face-up card (nothing hidden to reveal)', async () => {
    const { yDoc } = renderWithGame(<GameContextMenu />);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    yCards.set('card-1', makeCard({ isFlipped: false, ownerId: 'test-player' }));

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'battlefieldCard', id: 'card-1' },
        x: 10,
        y: 10,
        viaTouch: true,
      });
    });

    await screen.findByRole('menuitem', { name: /^Tap\b/ });
    expect(screen.queryByRole('menuitem', { name: /^Peek\b/ })).not.toBeInTheDocument();
  });

  it('hides the Peek row on a double-faced card showing its real back', async () => {
    const { yDoc } = renderWithGame(<GameContextMenu />);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    yCards.set('card-1', makeCard({
      isFlipped: true,
      ownerId: 'test-player',
      images: { front: { normal: 'f.png' }, back: { normal: 'b.png' } },
    }));

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'battlefieldCard', id: 'card-1' },
        x: 10,
        y: 10,
        viaTouch: true,
      });
    });

    await screen.findByRole('menuitem', { name: /^Tap\b/ });
    expect(screen.queryByRole('menuitem', { name: /^Peek\b/ })).not.toBeInTheDocument();
  });

  it("hides the Peek row on an opponent's facedown card (would leak hidden info)", async () => {
    const { yDoc } = renderWithGame(<GameContextMenu />);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    yCards.set('card-1', makeCard({ isFlipped: true, ownerId: 'opponent' }));

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'battlefieldCard', id: 'card-1' },
        x: 10,
        y: 10,
        viaTouch: true,
      });
    });

    await screen.findByRole('menuitem', { name: /^Tap\b/ });
    expect(screen.queryByRole('menuitem', { name: /^Peek\b/ })).not.toBeInTheDocument();
  });

  it('offers "Play to board facedown" on a pile-viewer card and dispatches it to the open viewer', async () => {
    const user = userEvent.setup();
    const actionHandler = vi.fn();
    renderWithGame(<GameContextMenu />);

    // Stand in for an open deck viewer: it can move a card to hand and play it
    // face down (see PileViewerReact's registration).
    act(() => {
      usePileViewerHotkeyStore.getState().setActionHandler(
        actionHandler,
        new Set(['moveToHand', 'playFacedown']),
      );
      useContextMenuStore.getState().openMenu({
        target: { kind: 'pileViewerCard', id: 'card-1', context: HotkeyContext.DeckCard },
        x: 10,
        y: 10,
      });
    });

    const playItem = await screen.findByRole('menuitem', { name: /^Play to board facedown\b/ });
    // Rows the viewer has no callback for are dropped rather than rendered as
    // no-ops — this deck viewer was given no exile callback.
    expect(screen.queryByRole('menuitem', { name: /^Exile\b/ })).not.toBeInTheDocument();

    await user.click(playItem);
    expect(actionHandler).toHaveBeenCalledWith('playFacedown', 'card-1');
  });

  it('gives a read-only pile viewer no menu at all', async () => {
    renderWithGame(<GameContextMenu />);

    // An opponent's pile viewer registers no actions.
    act(() => {
      usePileViewerHotkeyStore.getState().setActionHandler(() => {}, new Set());
      useContextMenuStore.getState().openMenu({
        target: { kind: 'pileViewerCard', id: 'card-1', context: HotkeyContext.Exile },
        x: 10,
        y: 10,
      });
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
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

  it('board menu replaces "-1/-1 counter" with a "Keyword counters" grid item', async () => {
    const user = userEvent.setup();
    renderWithGame(<GameContextMenu />);

    act(() => {
      useContextMenuStore.getState().openMenu({
        target: { kind: 'board', x: 10, y: 10 },
        x: 10,
        y: 10,
      });
    });

    // The drag-to-board grid took the "-1/-1 counter" slot on the empty board
    // menu; the "+1/+1" ("Counter") row is untouched. `/^Counter\b/` matches
    // only that row, not "Keyword counters" (which starts with "Keyword").
    const createToken = await screen.findByRole('menuitem', { name: /^Keyword counters\b/ });
    expect(screen.getByRole('menuitem', { name: /^Counter\b/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /-1\/-1 counter/ })).not.toBeInTheDocument();

    // Deck-pile actions (Shuffle/Mulligan) and per-player health (+1/-1 life)
    // aren't empty-board actions — they live on the deck and health-node menus,
    // not here.
    expect(screen.queryByRole('menuitem', { name: /^Shuffle\b/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Mulligan\b/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^\+1 life\b/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^-1 life\b/ })).not.toBeInTheDocument();

    // It hosts the same drag-to-board grid as the toolbar's Create ▾ menu.
    await user.click(createToken);
    expect(await screen.findByText(/drag a counter onto the board/i)).toBeInTheDocument();
  });
});
