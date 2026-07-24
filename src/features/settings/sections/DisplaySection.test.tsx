import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DisplaySection } from './DisplaySection';
import { useSettingsStore } from '@/app/stores/settingsStore';

/**
 * DisplaySection reflects/updates useSettingsStore. Sliders and the checkbox
 * were given aria-labels (previously unlabeled) so they're queryable by role
 * — the same change makes them properly accessible.
 *
 * Scope note: DisplaySection also drives a live cross-store demo
 * (demoHandCards / cardPreviewStore) while a slider is being *dragged* with
 * the mouse — that start/end signal comes from Radix's pointer-drag path
 * (onSlideStart/Move/End), which needs real layout geometry to simulate
 * correctly. That's pointer-physics territory the plan already routes to
 * E2E, not vitest, so it's left untested here.
 */
describe('DisplaySection', () => {
  it('shows the current zoom values from the settings store', () => {
    useSettingsStore.setState({ handZoom: 1.5, previewZoom: 0.8 });
    render(<DisplaySection />);

    expect(screen.getByRole('slider', { name: 'Hand card size' })).toHaveAttribute('aria-valuenow', '1.5');
    expect(screen.getByRole('slider', { name: 'Card preview size' })).toHaveAttribute('aria-valuenow', '0.8');
  });

  it('arrow-key adjusts hand zoom through the real setter', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ handZoom: 1 });
    render(<DisplaySection />);

    screen.getByRole('slider', { name: 'Hand card size' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(useSettingsStore.getState().handZoom).toBeCloseTo(1.1);
  });

  it('arrow-key adjusts preview zoom through the real setter', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ previewZoom: 1 });
    render(<DisplaySection />);

    screen.getByRole('slider', { name: 'Card preview size' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(useSettingsStore.getState().previewZoom).toBeCloseTo(1.1);
  });

  it('toggles snap-to-grid via the checkbox', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ snapToGridEnabled: false });
    render(<DisplaySection />);

    await user.click(screen.getByRole('checkbox', { name: 'Always snap to grid' }));

    expect(useSettingsStore.getState().snapToGridEnabled).toBe(true);
  });

  it('toggles confirm-card-deletion via the checkbox', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ confirmCardDeletion: true });
    render(<DisplaySection />);

    await user.click(screen.getByRole('checkbox', { name: 'Confirm card deletion' }));

    expect(useSettingsStore.getState().confirmCardDeletion).toBe(false);
  });
});
