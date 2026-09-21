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

  describe('help sections', () => {
    const typeSearch = async (query: string) => {
      const user = userEvent.setup();
      await user.type(await screen.findByPlaceholderText(/search actions/i), query);
    };

    it('surfaces a section for a term that exists nowhere else in the app', async () => {
      // Scry has no keystroke, so `getHotkeysGroupedByZone` drops it from the
      // reference rows and it isn't runnable — before this, "scry" in ⌘K found
      // nothing at all.
      openPalette();
      render(<CommandPalette />);
      await typeSearch('scry');

      expect(await screen.findByText('Deck actions')).toBeInTheDocument();
    });

    it('matches on a curated keyword the section title never mentions', async () => {
      openPalette();
      render(<CommandPalette />);
      await typeSearch('poison');

      expect(await screen.findByText('Life and player counters')).toBeInTheDocument();
    });

    it('opens Help at that section and closes the palette', async () => {
      openPalette();
      render(<CommandPalette />);
      await typeSearch('scry');
      const user = userEvent.setup();
      await user.click(await screen.findByText('Deck actions'));

      await waitFor(() =>
        expect(useOverlayStore.getState().helpTarget).toEqual({
          tab: 'guide',
          section: 'deck-actions',
        }),
      );
      expect(useOverlayStore.getState().helpOpen).toBe(true);
      expect(useOverlayStore.getState().commandPaletteOpen).toBe(false);
    });

    // NOTE: which row ends up SELECTED is not asserted here. cmdk orders rows
    // with real DOM moves that happy-dom doesn't carry out, so the first row in
    // source order stays aria-selected no matter what the filter returns — any
    // assertion about it passes even with the filter deleted. Selection is
    // pinned in tests/e2e/app/menu/palette_help_search.spec.ts.
  });
});
