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
// file covers the JS behavior instead: the desktop buttons and the overflow
// menu's items both drive the same single modal/handler instances.
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
    expect(screen.getByRole('button', { name: 'Hotkeys' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Discord Server' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more toolbar options/i })).toBeInTheDocument();
  });

  it('opens the Hotkeys modal from the desktop button', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Hotkeys' }));

    expect(screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
  });

  it('opens the same Help modal from both the desktop button and the overflow menu', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The overflow menu's "Help" item drives the very same modal instance —
    // there's exactly one HelpModal mounted, not a second copy per surface.
    await user.click(screen.getByRole('button', { name: /more toolbar options/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Help' }));
    expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
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
