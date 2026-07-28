import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { ProfileSection } from './ProfileSection';
import { Player } from '@/features/player';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

/**
 * Drives a real Player over a real Y.Doc (never a mock — see
 * tests/testing-react.md), because the point of these settings is what they
 * write to shared state, not that a callback fired.
 */
function mountWithPlayer(playerId = 'player-abc123456') {
  const yDoc = new Y.Doc();
  const player = new Player(playerId, yDoc);
  useGameInstance.setState({ yDoc, player, playerId });
  return { yDoc, player };
}

describe('ProfileSection', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameInstance.setState({ yDoc: null, player: null, playerId: null });
  });

  it('shows the current name and commits a rename on blur', async () => {
    const user = userEvent.setup();
    const { player } = mountWithPlayer();
    render(<ProfileSection />);

    const input = screen.getByRole('textbox', { name: 'Display name' });
    expect(input).toHaveValue(player.getName());

    await user.clear(input);
    await user.type(input, 'Jace');
    await user.tab();

    expect(player.getName()).toBe('Jace');
  });

  it('falls back to the default name when cleared, rather than saving blank', async () => {
    const user = userEvent.setup();
    const { player } = mountWithPlayer();
    const defaultName = player.getName();
    render(<ProfileSection />);

    const input = screen.getByRole('textbox', { name: 'Display name' });
    await user.clear(input);
    await user.tab();

    expect(player.getName()).toBe(defaultName);
    // The box reflects what was actually stored, not the empty string.
    expect(input).toHaveValue(defaultName);
  });

  it('renders the default hsl() color as a hex the color input can display', () => {
    const { player } = mountWithPlayer();
    // Guard the premise: the seeded default really is hsl(), which is exactly
    // what <input type="color"> cannot render.
    expect(player.getColor()).toMatch(/^hsl\(/);

    render(<ProfileSection />);

    // <input type="color"> silently renders anything non-hex as #000000, so
    // "is a hex string" is the whole assertion.
    expect((screen.getByLabelText('Player color') as HTMLInputElement).value)
      .toMatch(/^#[0-9a-f]{6}$/);
  });

  it('writes a picked color through to the player', () => {
    const { player } = mountWithPlayer();
    render(<ProfileSection />);

    // A color input has no keyboard or click affordance to drive with
    // userEvent — fireEvent.change is the supported way to set one.
    fireEvent.change(screen.getByLabelText('Player color'), { target: { value: '#ff0000' } });

    expect(player.getColor()).toBe('#ff0000');
  });

  it('persists the picked color so the next boot does not reseed the default', () => {
    const { player } = mountWithPlayer();
    render(<ProfileSection />);

    fireEvent.change(screen.getByLabelText('Player color'), { target: { value: '#00ff00' } });

    // A fresh Player over a fresh doc is what a reload looks like. Without the
    // localStorage round-trip the constructor reseeds colorFromPlayerId here.
    const reloaded = new Player('player-abc123456', new Y.Doc());
    expect(reloaded.getColor()).toBe('#00ff00');
    expect(player.getColor()).toBe('#00ff00');
  });
});
