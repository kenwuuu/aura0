import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toolbar } from './Toolbar';
import type { YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';
import type { Awareness } from 'y-protocols/awareness';

// Toolbar's own responsive collapse is CSS-first (see the file header in
// Toolbar.tsx) and covered by tests/e2e/app/menu/toolbar_responsive.spec.ts —
// jsdom/happy-dom doesn't evaluate the media queries that drive it, so there's
// nothing for this file to assert about visibility at a given width. This
// file covers the JS behavior instead: the desktop controls and the overflow
// menu's items drive the same handlers.
function makeYjsNetworkProvider(): YjsNetworkProvider {
  return {
    status: () => 'connecting',
    on: () => {},
    off: () => {},
    whenSynced: () => Promise.resolve(),
    getAwareness: () => ({} as unknown as Awareness),
    destroy: () => {},
  };
}

function renderToolbar() {
  return render(
    <Toolbar yjsNetworkProvider={makeYjsNetworkProvider()} onDeckSelected={() => {}} />,
  );
}

describe('<Toolbar>', () => {
  it('renders the deck-import, secondary action, and room controls', () => {
    renderToolbar();

    expect(screen.getByTestId('deck-import-open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Discord Server' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more toolbar options/i })).toBeInTheDocument();
  });

  it('renders the Ko-fi support link and mirrors it in the overflow menu', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderToolbar();

    // Desktop row: a plain external link (the old Ko-fi widget script is gone).
    const link = screen.getByRole('link', { name: 'Support me on Ko-fi' });
    expect(link).toHaveAttribute('href', 'https://ko-fi.com/Z8Z11OOHFX');
    expect(link).toHaveAttribute('target', '_blank');

    // Overflow menu drives the same destination for phone widths.
    await user.click(screen.getByRole('button', { name: /more toolbar options/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Support me on Ko-fi' }));
    expect(openSpy).toHaveBeenCalledWith('https://ko-fi.com/Z8Z11OOHFX', '_blank');
  });

  it('opens Discord from the overflow menu', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderToolbar();

    await user.click(screen.getByRole('button', { name: /more toolbar options/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Discord' }));

    expect(openSpy).toHaveBeenCalledWith('https://discord.gg/PgH2gVZYKq', '_blank');
  });
});
