import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneHudStack } from './PhoneHudStack';
import { renderWithGame } from '@/test/harness';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

/**
 * PhoneHudStack is pure composition: two toggle buttons that show/hide the
 * extracted ActionLogBody / GameActionsContent. The bodies' behavior is
 * covered by their own suites (GameActionsToolbar.test.tsx, action-log); here
 * we only assert the toggle wiring. The phone/desktop branch itself lives in
 * App.tsx via usePhoneLayout, not in this component.
 */

/** PhoneHudStack takes yDoc/localPlayerId as props; read them back out of the
 * store that renderWithGame seeds, exactly as App.tsx passes them down. */
function Subject() {
  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);
  if (!yDoc || !playerId) return null;
  return <PhoneHudStack yDoc={yDoc} localPlayerId={playerId} />;
}

describe('PhoneHudStack', () => {
  it('starts with both panels closed: only the two toggle buttons render', () => {
    renderWithGame(<Subject />);

    expect(screen.getByRole('button', { name: 'Toggle game actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle action log' })).toBeInTheDocument();
    expect(screen.queryByTestId('game-actions-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByText('No actions yet')).not.toBeInTheDocument();
  });

  it('expands and collapses the game-actions panel from its toggle', async () => {
    const user = userEvent.setup();
    renderWithGame(<Subject />);
    const toggle = screen.getByRole('button', { name: 'Toggle game actions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByTestId('game-actions-toolbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Toggle game actions' }),
    ).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Toggle game actions' }));
    expect(screen.queryByTestId('game-actions-toolbar')).not.toBeInTheDocument();
  });

  it('expands and collapses the action log from its toggle', async () => {
    const user = userEvent.setup();
    renderWithGame(<Subject />);

    await user.click(screen.getByRole('button', { name: 'Toggle action log' }));
    expect(screen.getByText('No actions yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Toggle action log' }));
    expect(screen.queryByText('No actions yet')).not.toBeInTheDocument();
  });

  it('keeps the two panels independent', async () => {
    const user = userEvent.setup();
    renderWithGame(<Subject />);

    await user.click(screen.getByRole('button', { name: 'Toggle game actions' }));
    await user.click(screen.getByRole('button', { name: 'Toggle action log' }));
    expect(screen.getByTestId('game-actions-toolbar')).toBeInTheDocument();
    expect(screen.getByText('No actions yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Toggle game actions' }));
    expect(screen.queryByTestId('game-actions-toolbar')).not.toBeInTheDocument();
    expect(screen.getByText('No actions yet')).toBeInTheDocument();
  });
});
