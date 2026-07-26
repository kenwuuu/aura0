import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportSessionModal } from './ImportSessionModal';
import { SESSION_SCHEMA_VERSION, emptyZones, toCardRef } from './sessionSnapshot';
import { makeCards } from '@/test/factories';
import { readVisitedRooms } from '@/features/room/RoomManager';
import { getSeatAlias } from '@/infrastructure/networking';

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  // jsdom/happy-dom won't navigate; stubbing `assign` is what lets the test
  // observe the decision instead of the navigation.
  vi.stubGlobal('location', { ...window.location, assign, search: '' });
});

function savedGame(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: SESSION_SCHEMA_VERSION,
    exportedAt: Date.parse('2026-07-20T12:00:00Z'),
    roomName: 'mtg-original',
    seats: [
      { seatId: 'alice', name: 'Alice', color: '#f00', joinedAt: 1, health: 40,
        customCounters: [], deckRevealCount: 0, allowViewHand: false,
        zones: { ...emptyZones(), deck: makeCards(60).map((c) => toCardRef(c)) } },
      { seatId: 'bob', name: 'Bob', color: '#00f', joinedAt: 2, health: 40,
        customCounters: [], deckRevealCount: 0, allowViewHand: false,
        zones: { ...emptyZones(), deck: makeCards(40).map((c) => toCardRef(c)) } },
    ],
    board: [],
    tokens: [],
    actionLog: [],
    ...overrides,
  });
}

const file = (contents: string, name = 'saved-game.json') =>
  new File([contents], name, { type: 'application/json' });

async function pickFile(contents: string) {
  const user = userEvent.setup();
  render(<ImportSessionModal open onOpenChange={vi.fn()} />);
  await user.upload(screen.getByLabelText(/saved game file/i), file(contents));
  return user;
}

describe('<ImportSessionModal>', () => {
  it('previews what is in the file before restoring anything', async () => {
    await pickFile(savedGame());

    expect(await screen.findByText(/2 players/i)).toBeInTheDocument();
    expect(screen.getByText(/100 cards/i)).toBeInTheDocument();
  });

  it('asks which player you are, offering every seat by name', async () => {
    await pickFile(savedGame());

    expect(await screen.findByRole('button', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();
  });

  it('restores into a new room once a seat is picked', async () => {
    const user = await pickFile(savedGame());

    await user.click(await screen.findByRole('button', { name: 'Bob' }));

    const url = assign.mock.calls[0][0] as string;
    const room = new URLSearchParams(url).get('room')!;
    expect(room).not.toBe('mtg-original');
    expect(getSeatAlias(room)).toBe('bob');
    // Marked visited so auto-load can't reset the game we just restored.
    expect(readVisitedRooms()).toContain(room);
  });

  it('reports a file that is not a saved game, and restores nothing', async () => {
    await pickFile('my shopping list');

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't a saved aura game/i);
    expect(assign).not.toHaveBeenCalled();
  });

  it('refuses a file from a newer version rather than partly applying it', async () => {
    await pickFile(savedGame({ schemaVersion: SESSION_SCHEMA_VERSION + 1 }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/newer version/i);
    expect(screen.queryByRole('button', { name: 'Alice' })).not.toBeInTheDocument();
  });

  it('reports a saved game with no players in it', async () => {
    await pickFile(savedGame({ seats: [] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no players/i);
  });

  it('clears a previous error when a good file is picked next', async () => {
    const user = await pickFile('not a game');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.upload(screen.getByLabelText(/saved game file/i), file(savedGame()));

    expect(await screen.findByRole('button', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
