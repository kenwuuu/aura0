/**
 * The "don't ask again" checkbox is the part worth pinning down: it reports
 * through onConfirm rather than owning a preference itself, and it must stay
 * silent on cancel. Ticking the box and then backing out would otherwise arm
 * the very action the player just declined — the next Backspace would delete
 * with no prompt at all.
 *
 * Radix's Dialog renders into a portal; RTL's screen queries search the whole
 * document, so no special handling is needed here.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      isOpen
      title="Delete card?"
      description="Removes Lightning Bolt from the battlefield."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  // Was a bare <p>, so the dialog had no aria-describedby and Radix logged a
  // "Missing `Description`" warning on every open.
  it('announces the description to assistive tech', () => {
    renderDialog();

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Removes Lightning Bolt from the battlefield.',
    );
  });

  it('has no opt-out checkbox unless a label is given', () => {
    renderDialog();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('reports dontAskAgain=false when the box is left unticked', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ dontAskAgainLabel: "Don't ask again" });

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('reports dontAskAgain=true when the box is ticked before confirming', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ dontAskAgainLabel: "Don't ask again" });

    await user.click(screen.getByRole('checkbox', { name: "Don't ask again" }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  // The whole reason the checkbox reports through onConfirm instead of writing
  // the preference on change: cancelling must leave the setting alone.
  it('does not confirm — and so cannot suppress — when cancelled with the box ticked', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog({ dontAskAgainLabel: "Don't ask again" });

    await user.click(screen.getByRole('checkbox', { name: "Don't ask again" }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
