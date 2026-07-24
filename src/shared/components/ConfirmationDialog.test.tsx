import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationDialog } from './ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('confirms and cancels via the callbacks', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        message="Delete this card?"
        confirmKey="Backspace"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not show a "don\'t ask again" checkbox by default', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        message="Delete this card?"
        confirmKey="Backspace"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('reports the checkbox state through onDontAskAgainChange when shown', async () => {
    const user = userEvent.setup();
    const onDontAskAgainChange = vi.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        message="Delete this card?"
        confirmKey="Backspace"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        showDontAskAgain
        onDontAskAgainChange={onDontAskAgainChange}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: "Don't ask me again" }));

    expect(onDontAskAgainChange).toHaveBeenCalledWith(true);
  });
});
