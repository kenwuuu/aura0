import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeSeatSetting, useHasClaimedSeat } from './ChangeSeatSetting';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { RoomManager } from '@/features/room';
import { setSeatAlias, getSeatAlias } from '@/infrastructure/networking';

const reload = vi.fn();

beforeEach(() => {
  reload.mockReset();
  vi.stubGlobal('location', { ...window.location, reload, search: '?room=mtg-restored' });
  window.history.replaceState({}, '', '?room=mtg-restored');
  useGameInstance.getState().setRoomManager(new RoomManager());
});

describe('<ChangeSeatSetting>', () => {
  it('offers nothing outside a restored game', () => {
    // An ordinary room has no seat to change, and an empty control just raises
    // the question of what it would have done.
    render(<ChangeSeatSetting />);

    expect(screen.queryByRole('button', { name: /change seat/i })).not.toBeInTheDocument();
  });

  it('offers a way out once a seat has been claimed', () => {
    setSeatAlias('mtg-restored', 'alice');

    render(<ChangeSeatSetting />);

    expect(screen.getByRole('button', { name: /change seat/i })).toBeInTheDocument();
  });

  it('confirms before releasing the seat', async () => {
    // Changing seat reloads the game, so a stray click shouldn't do it.
    const user = userEvent.setup();
    setSeatAlias('mtg-restored', 'alice');
    render(<ChangeSeatSetting />);

    await user.click(screen.getByRole('button', { name: /change seat/i }));

    expect(await screen.findByText(/asks which seat is yours again/i)).toBeInTheDocument();
    expect(getSeatAlias('mtg-restored')).toBe('alice');
    expect(reload).not.toHaveBeenCalled();
  });

  it('releases the seat and reloads into the picker on confirm', async () => {
    const user = userEvent.setup();
    setSeatAlias('mtg-restored', 'alice');
    render(<ChangeSeatSetting />);
    await user.click(screen.getByRole('button', { name: /change seat/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /change seat/i }));

    expect(getSeatAlias('mtg-restored')).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it('keeps the seat when the player backs out', async () => {
    const user = userEvent.setup();
    setSeatAlias('mtg-restored', 'alice');
    render(<ChangeSeatSetting />);
    await user.click(screen.getByRole('button', { name: /change seat/i }));

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(getSeatAlias('mtg-restored')).toBe('alice');
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not touch other rooms', () => {
    setSeatAlias('mtg-restored', 'alice');
    setSeatAlias('mtg-elsewhere', 'bob');
    render(<ChangeSeatSetting />);

    expect(getSeatAlias('mtg-elsewhere')).toBe('bob');
  });
});

describe('useHasClaimedSeat', () => {
  it('is false in an ordinary room', () => {
    expect(renderHook(() => useHasClaimedSeat()).result.current).toBe(false);
  });

  it('is true once this device holds a seat', () => {
    setSeatAlias('mtg-restored', 'alice');

    expect(renderHook(() => useHasClaimedSeat()).result.current).toBe(true);
  });
});
