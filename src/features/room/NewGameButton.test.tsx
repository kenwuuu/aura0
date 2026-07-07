import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithGame } from '@/test/harness';
import { NewGameButton } from './NewGameButton';
import { useConfirmStore } from '@/app/stores/confirmStore';

describe('NewGameButton', () => {
  it('opens a confirmation before starting a new game', async () => {
    const user = userEvent.setup();
    renderWithGame(<NewGameButton />);

    await user.click(screen.getByRole('button', { name: /new game/i }));

    const request = useConfirmStore.getState().request;
    expect(request).not.toBeNull();
    expect(request!.title).toBe('Start a New Game?');
    expect(request!.confirmLabel).toBe('New Game');
  });
});
