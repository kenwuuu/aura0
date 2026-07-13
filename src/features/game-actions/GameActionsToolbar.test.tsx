import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameActionsToolbar } from './GameActionsToolbar';
import { renderWithGame } from '@/test/harness';
import { getActionLog } from '@/features/action-log/actionLog';
import { useTokenCardSearchStore } from './tokenCardSearchStore';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';

/**
 * GameActionsToolbar is a thin dispatcher: it builds a GameActionContext from
 * useGameInstance and routes clicks to GAME_ACTIONS by id. The dispatch
 * contract for every action is already covered at the logic tier
 * (gameActions.test.ts); these tests only confirm the wiring seam — one
 * representative action per surface (toolbar button, Actions dropdown,
 * Create dropdown) reaches the registry through real clicks.
 */
describe('GameActionsToolbar', () => {
  it('renders nothing until the game instance is seeded', () => {
    render(<GameActionsToolbar />);
    expect(screen.queryByTestId('game-actions-toolbar')).not.toBeInTheDocument();
  });

  it('toolbar button: Draw draws a card via the seeded player', async () => {
    const user = userEvent.setup();
    const { player } = renderWithGame(<GameActionsToolbar />, {
      deck: [{ id: 'c1' } as any],
    });

    await user.click(screen.getByRole('button', { name: 'Draw' }));

    expect(player.getState().hand).toHaveLength(1);
  });

  it('toolbar button: Untap All untaps the player\'s tapped board cards and logs it', async () => {
    const user = userEvent.setup();
    const { yDoc, playerId } = renderWithGame(<GameActionsToolbar />);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    yCards.set('card-1', {
      id: 'card-1', cardNumber: 1, x: 0, y: 0, rotation: 0, isTapped: true, isFlipped: false,
      counters: [], zIndex: 1, ownerId: playerId,
    });

    await user.click(screen.getByRole('button', { name: 'Untap All' }));

    expect(yCards.get('card-1')!.isTapped).toBe(false);
    const log = getActionLog(yDoc).toArray();
    expect(log.some((e) => e.type === 'untap_all')).toBe(true);
  });

  it('Actions dropdown: Mulligan draws a fresh 7-card hand', async () => {
    const user = userEvent.setup();
    const { player } = renderWithGame(<GameActionsToolbar />, {
      deck: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }) as any),
    });

    await user.click(screen.getByRole('button', { name: /Actions/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mulligan' }));

    expect(player.getState().hand).toHaveLength(7);
  });

  it('Create dropdown: Token Card opens the token card search store', async () => {
    const user = userEvent.setup();
    renderWithGame(<GameActionsToolbar />);

    await user.click(screen.getByRole('button', { name: /Create/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Token Card' }));

    expect(useTokenCardSearchStore.getState().isOpen).toBe(true);
  });

  it('logs a pass_turn entry when Pass is clicked, without touching player state', async () => {
    const user = userEvent.setup();
    const { yDoc, player } = renderWithGame(<GameActionsToolbar />);
    const healthBefore = player.getState().health;

    await user.click(screen.getByRole('button', { name: 'Pass' }));

    const log = getActionLog(yDoc).toArray();
    expect(log.some((e) => e.type === 'pass_turn')).toBe(true);
    expect(player.getState().health).toBe(healthBefore);
  });

  /**
   * Regression: the "Token" create item hosts a popover (the drag-to-board
   * keyword grid) rather than performing an action. It once used a
   * `PopoverTrigger` wrapped around the `DropdownMenuItem` while *also*
   * toggling `open` from `onSelect` — two handlers on one click, netting out to
   * "never opens". It is now a `PopoverAnchor` (position only, no click
   * behavior). Assert the grid is actually reachable.
   */
  it('Create dropdown: Token opens the keyword-token popover and keeps the menu open', async () => {
    const user = userEvent.setup();
    renderWithGame(<GameActionsToolbar />);

    await user.click(screen.getByRole('button', { name: /Create/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Token' }));

    expect(await screen.findByText(/drag a token onto the board/i)).toBeInTheDocument();
    // The item `preventDefault`s its own select so the dropdown survives —
    // otherwise the popover would open and its anchor would vanish underneath it.
    expect(screen.getByRole('menuitem', { name: 'Token Card' })).toBeInTheDocument();
  });

  /**
   * Regression: these dropdowns are `modal={false}` (an item can open a Dialog,
   * and two modal layers fight over `document.body`'s pointer-events). The cost
   * is that Radix's freshly-mounted dismiss layer used to treat the click that
   * *reopens* the trigger as an outside interaction and close the menu again —
   * so after selecting any item, the next click on "Actions" did nothing.
   * `keepTriggerInteractionsInside` fixes it. Reveal Hand is the sharpest case:
   * it's the only stateful item, so a user genuinely reopens the menu to toggle
   * it back off.
   */
  it('Actions dropdown: reopens after an item was selected, so Reveal Hand can be toggled back off', async () => {
    const user = userEvent.setup();
    const { player } = renderWithGame(<GameActionsToolbar />);

    await user.click(screen.getByRole('button', { name: /Actions/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reveal Hand' }));
    expect(player.getAllowViewHand()).toBe(true);

    // The reopen is the regression: this click used to be swallowed.
    await user.click(screen.getByRole('button', { name: /Actions/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reveal Hand' }));

    expect(player.getAllowViewHand()).toBe(false);
  });
});
