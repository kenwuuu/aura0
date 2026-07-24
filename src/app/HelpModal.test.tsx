import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpModal } from './HelpModal';
import { useOverlayStore } from '@/app/stores/overlayStore';

describe('HelpModal', () => {
  beforeEach(() => {
    useOverlayStore.setState({ commandPaletteOpen: false, helpOpen: true, deckSelectionOpen: false });
  });

  it('shows the Guide tab by default', () => {
    render(<HelpModal />);
    // A heading from help.md, rendered as markdown in the Guide tab.
    expect(screen.getByRole('heading', { name: /getting started/i })).toBeInTheDocument();
  });

  it('renders live shortcuts from the catalog on the Shortcuts tab', async () => {
    const user = userEvent.setup();
    render(<HelpModal />);

    await user.click(screen.getByRole('tab', { name: /shortcuts/i }));

    // Pulled live from HOTKEYS — key badge and its long description.
    expect(await screen.findByText('Tap card')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    // The zone headings and the ⌘K discoverability tip are present.
    expect(screen.getByText('Battlefield')).toBeInTheDocument();
    expect(screen.getByText(/press/i)).toBeInTheDocument();
  });
});
