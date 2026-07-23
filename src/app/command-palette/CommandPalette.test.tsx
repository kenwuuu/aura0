import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from './CommandPalette';
import { useOverlayStore } from '@/app/stores/overlayStore';

// The palette dispatches through gameActions; stub it so runnable items don't
// need a seeded game instance.
const dispatchGameAction = vi.fn();
vi.mock('@/features/hotkeys/gameActions', () => ({
  dispatchGameAction: (...args: unknown[]) => dispatchGameAction(...args),
}));

const openPalette = () =>
  useOverlayStore.setState({ commandPaletteOpen: true, helpOpen: false, deckSelectionOpen: false });

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOverlayStore.setState({ commandPaletteOpen: false, helpOpen: false, deckSelectionOpen: false });
  });

  it('renders runnable actions when open', async () => {
    openPalette();
    render(<CommandPalette />);
    expect(await screen.findByText('Draw a card')).toBeInTheDocument();
    expect(screen.getByText('Import a deck')).toBeInTheDocument();
  });

  it('⌘K / Ctrl+K toggles the palette open', () => {
    render(<CommandPalette />);
    expect(useOverlayStore.getState().commandPaletteOpen).toBe(false);
    // Fire with both modifiers so it matches whether `mod` resolves to ⌘ or Ctrl.
    fireEvent.keyDown(document, { key: 'k', code: 'KeyK', ctrlKey: true, metaKey: true });
    expect(useOverlayStore.getState().commandPaletteOpen).toBe(true);
  });

  it('shows target-bound keys as a reference, without duplicating runnable ones', async () => {
    openPalette();
    render(<CommandPalette />);
    // "Tap card" needs a hovered card → reference only.
    expect(await screen.findByText('Tap card')).toBeInTheDocument();
    // "Draw" is runnable (the Game group), so it must not also appear as a bare
    // reference row — exactly one node mentions drawing.
    expect(screen.queryByText('Draw a card')).toBeInTheDocument();
    expect(screen.queryByText('Draw', { exact: true })).not.toBeInTheDocument();
  });

  it('running a game command dispatches it and closes the palette', async () => {
    openPalette();
    render(<CommandPalette />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Draw a card'));

    expect(dispatchGameAction).toHaveBeenCalledWith('draw', expect.objectContaining({ kind: 'board' }));
    await waitFor(() => expect(useOverlayStore.getState().commandPaletteOpen).toBe(false));
  });

  it('a navigation command opens the target overlay', async () => {
    openPalette();
    render(<CommandPalette />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Open Help'));

    await waitFor(() => expect(useOverlayStore.getState().helpOpen).toBe(true));
    expect(useOverlayStore.getState().commandPaletteOpen).toBe(false);
  });
});
