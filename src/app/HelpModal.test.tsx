import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpModal } from './HelpModal';
import { useOverlayStore } from '@/app/stores/overlayStore';
import { HELP_SECTIONS } from '@/app/content/help/sections';

const rail = () => screen.getByRole('navigation', { name: /help sections/i });

describe('HelpModal', () => {
  beforeEach(() => {
    useOverlayStore.setState({
      commandPaletteOpen: false,
      helpOpen: true,
      deckSelectionOpen: false,
      helpTarget: null,
    });
  });

  it('shows the Guide tab by default, with every section in the rail', () => {
    render(<HelpModal />);

    for (const section of HELP_SECTIONS) {
      expect(within(rail()).getByRole('button', { name: section.title })).toBeInTheDocument();
    }
  });

  it('renders section prose in the pane', () => {
    render(<HelpModal />);

    // Every section is in the DOM at once — the rail scrolls, it doesn't filter.
    expect(screen.getByRole('heading', { name: 'Inviting friends' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Troubleshooting' })).toBeInTheDocument();
  });

  it('renders a `key:` span as the action’s live binding', () => {
    render(<HelpModal />);

    // "Tapping and untapping" says `key:tap`; HOTKEYS binds tap to Space. If
    // the binding ever changes, this text follows it rather than going stale.
    const section = document.querySelector('[data-help-section="tapping-and-untapping"]');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getAllByText('Space').length).toBeGreaterThan(0);
  });

  it('marks the section you pick in the rail as current', async () => {
    const user = userEvent.setup();
    render(<HelpModal />);

    const deckActions = within(rail()).getByRole('button', { name: 'Deck actions' });
    expect(deckActions).not.toHaveAttribute('aria-current');

    await user.click(deckActions);

    expect(deckActions).toHaveAttribute('aria-current', 'true');
  });

  it('opens on the Shortcuts tab when asked for it', async () => {
    useOverlayStore.getState().openHelp({ tab: 'shortcuts' });
    render(<HelpModal />);

    // Pulled live from HOTKEYS — key badge and its long description.
    expect(await screen.findByText('Tap card')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /shortcuts/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens at the requested guide section', () => {
    useOverlayStore.getState().openHelp({ tab: 'guide', section: 'deck-actions' });
    render(<HelpModal />);

    expect(within(rail()).getByRole('button', { name: 'Deck actions' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('reopens on the Guide after a deep link to Shortcuts', async () => {
    // Radix unmounts the dialog's contents on close, but HelpModal itself stays
    // mounted — so the tab state survives. Without an explicit reset, one deep
    // link to Shortcuts left the toolbar's Help button opening there forever.
    const { rerender } = render(<HelpModal />);

    useOverlayStore.getState().openHelp({ tab: 'shortcuts' });
    rerender(<HelpModal />);
    expect(await screen.findByText('Tap card')).toBeInTheDocument();

    useOverlayStore.getState().close('help');
    rerender(<HelpModal />);
    useOverlayStore.getState().open('help');
    rerender(<HelpModal />);

    expect(screen.getByRole('tab', { name: /guide/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('clears the deep-link target when Help closes', () => {
    useOverlayStore.getState().openHelp({ tab: 'guide', section: 'deck-actions' });
    expect(useOverlayStore.getState().helpTarget).not.toBeNull();

    useOverlayStore.getState().close('help');

    // Otherwise the next plain `open('help')` from the toolbar would silently
    // reopen at whatever the last deep link pointed to.
    expect(useOverlayStore.getState().helpTarget).toBeNull();
  });

  it('renders live shortcuts from the catalog on the Shortcuts tab', async () => {
    const user = userEvent.setup();
    render(<HelpModal />);

    await user.click(screen.getByRole('tab', { name: /shortcuts/i }));

    expect(await screen.findByText('Tap card')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    // The zone headings and the ⌘K discoverability tip are present.
    expect(screen.getByText('Battlefield')).toBeInTheDocument();
    expect(screen.getByText(/press/i)).toBeInTheDocument();
  });
});
