import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameplaySection } from './GameplaySection';
import { useSettingsStore } from '@/app/stores/settingsStore';

/**
 * Snap-to-grid and the delete confirmation both moved here from
 * DisplaySection — neither changes how anything is drawn. These assertions
 * came with them.
 */
describe('GameplaySection', () => {
  it('reflects the current snap-to-grid value from the settings store', () => {
    useSettingsStore.setState({ snapToGridEnabled: true });
    render(<GameplaySection />);

    expect(screen.getByRole('checkbox', { name: 'Always snap to grid' })).toBeChecked();
  });

  it('toggles snap-to-grid through the real setter', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ snapToGridEnabled: false });
    render(<GameplaySection />);

    await user.click(screen.getByRole('checkbox', { name: 'Always snap to grid' }));

    expect(useSettingsStore.getState().snapToGridEnabled).toBe(true);
  });

  // This is the same preference the delete dialog's "Don't ask again" checkbox
  // writes, so the settings row is how a player turns the prompt back on.
  it('reflects the delete-confirmation preference', () => {
    useSettingsStore.setState({ confirmCardDelete: false });
    render(<GameplaySection />);

    expect(screen.getByRole('checkbox', { name: 'Ask before deleting a card' })).not.toBeChecked();
  });

  it('toggles the delete confirmation via the checkbox', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ confirmCardDelete: false });
    render(<GameplaySection />);

    await user.click(screen.getByRole('checkbox', { name: 'Ask before deleting a card' }));

    expect(useSettingsStore.getState().confirmCardDelete).toBe(true);
  });
});
