import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { SeatSelectionScreen } from './SeatSelectionScreen';
import { applySessionSnapshot, claimSeat } from './importSession';
import { createFakeCardLookup } from '@/test/mocks/cardLookup';
import { SESSION_SCHEMA_VERSION, emptyZones, toCardRef, type SessionSnapshot } from './sessionSnapshot';
import { makeCard, makeCards } from '@/test/factories';

function snapshot(): SessionSnapshot {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    exportedAt: 1_700_000_000_000,
    roomName: 'mtg-original',
    seats: [
      {
        seatId: 'alice',
        name: 'Alice',
        color: '#ff0000',
        deckName: 'Krenko Goblins',
        joinedAt: 1,
        health: 40,
        customCounters: [],
        deckRevealCount: 0,
        allowViewHand: false,
        zones: {
          ...emptyZones(),
          deck: makeCards(97).map((c) => toCardRef(c)),
          hand: makeCards(7).map((c) => toCardRef(c)),
        },
      },
      {
        seatId: 'bob',
        name: 'Bob',
        color: '#0000ff',
        deckName: 'Atraxa Superfriends',
        joinedAt: 2,
        health: 33,
        customCounters: [],
        deckRevealCount: 0,
        allowViewHand: false,
        zones: { ...emptyZones(), hand: [toCardRef(makeCard())] },
      },
    ],
    board: [],
    tokens: [],
    actionLog: [],
  };
}

/** Walk the picker's two steps: choose a seat, then confirm it is yours. */
async function pickAndConfirmSeat(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(screen.getByRole('button', { name: /yes, this is me/i }));
}

/** A doc that already holds a restored game, the way a peer's would. */
async function restoredDoc(): Promise<Y.Doc> {
  const yDoc = new Y.Doc();
  await applySessionSnapshot(yDoc, snapshot(), createFakeCardLookup().service);
  return yDoc;
}

const OWN_PEER = 'peer-self';

function renderScreen(yDoc: Y.Doc, overrides: Partial<Parameters<typeof SeatSelectionScreen>[0]> = {}) {
  const onClaim = vi.fn();
  const onJoinAsNew = vi.fn();
  render(
    <SeatSelectionScreen
      yDoc={yDoc}
      peerId={OWN_PEER}
      onClaim={onClaim}
      onJoinAsNew={onJoinAsNew}
      {...overrides}
    />,
  );
  return { onClaim, onJoinAsNew };
}

describe('<SeatSelectionScreen>', () => {
  it('offers one seat per player in the restored game', async () => {
    renderScreen(await restoredDoc());

    expect(screen.getByRole('button', { name: /krenko goblins/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /atraxa superfriends/i })).toBeInTheDocument();
  });

  it('leads with the deck name — what the player themselves called it', async () => {
    // The name alone is often an unset default (a sliced player id), and picking
    // the wrong seat reveals an opponent's hand.
    renderScreen(await restoredDoc());

    const seat = screen.getByRole('button', { name: /krenko goblins/i });
    expect(seat).toHaveTextContent('97 in deck');
    expect(seat).toHaveTextContent('7 in hand');
    expect(seat).toHaveTextContent('40 life');
  });

  it('never names a card in anyone\'s hand', async () => {
    // The one thing the picker exists to protect.
    renderScreen(await restoredDoc());

    expect(screen.queryByText(/lightning bolt/i)).not.toBeInTheDocument();
  });

  it('claims the seat once the player confirms it is theirs', async () => {
    const user = userEvent.setup();
    const { onClaim } = renderScreen(await restoredDoc());

    await pickAndConfirmSeat(user, /krenko goblins/i);

    expect(onClaim).toHaveBeenCalledWith('alice');
  });

  it('does not claim on the first click — the choice is confirmed first', async () => {
    // Claiming is a one-way door into somebody's hand, so a misclick must not
    // be enough to walk through it.
    const user = userEvent.setup();
    const { onClaim } = renderScreen(await restoredDoc());

    await user.click(screen.getByRole('button', { name: /krenko goblins/i }));

    expect(onClaim).not.toHaveBeenCalled();
    expect(screen.getByText(/make sure it's yours/i)).toBeInTheDocument();
  });

  it('lets a player back out of the wrong seat before committing', async () => {
    const user = userEvent.setup();
    const { onClaim } = renderScreen(await restoredDoc());
    await user.click(screen.getByRole('button', { name: /krenko goblins/i }));

    await user.click(screen.getByRole('button', { name: /not me/i }));

    expect(onClaim).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /atraxa superfriends/i })).toBeInTheDocument();
  });

  it('shows an already-claimed seat as taken, rather than hiding it', async () => {
    // A row vanishing mid-decision is disorienting; one greying out explains itself.
    const yDoc = await restoredDoc();
    claimSeat(yDoc, 'bob', 'peer-2');

    renderScreen(yDoc);

    expect(screen.getByRole('button', { name: /bob.*taken/is })).toBeDisabled();
    expect(screen.getByRole('button', { name: /alice/i })).toBeEnabled();
  });

  it('greys out a seat claimed by someone else while the screen is open', async () => {
    // The race this screen exists to make visible: two players deciding at once.
    const yDoc = await restoredDoc();
    renderScreen(yDoc);
    expect(screen.getByRole('button', { name: /bob/i })).toBeEnabled();

    act(() => claimSeat(yDoc, 'bob', 'peer-2'));

    expect(await screen.findByRole('button', { name: /bob.*taken/is })).toBeDisabled();
  });

  it('offers back a seat this device itself claimed', async () => {
    // The way out of the wrong seat runs through here: after Change Seat, the
    // seat you just left is still claimed — by you. Locking it would strand the
    // player who was trying to correct a mistake.
    const yDoc = await restoredDoc();
    claimSeat(yDoc, 'alice', OWN_PEER);

    renderScreen(yDoc);

    expect(screen.getByRole('button', { name: /krenko goblins.*was yours/is })).toBeEnabled();
  });

  it('lets a third player decline both seats and join as themselves', async () => {
    // Without this the invite link is a trap that seats a new friend in
    // somebody else's cards.
    const user = userEvent.setup();
    const { onJoinAsNew, onClaim } = renderScreen(await restoredDoc());

    await user.click(screen.getByRole('button', { name: /join as a new player/i }));

    expect(onJoinAsNew).toHaveBeenCalled();
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('waits, rather than showing an empty roster, before the game arrives', () => {
    // whenSynced() resolves on IndexedDB alone, so this screen genuinely mounts
    // before the roster exists — it arrives from a peer a moment later.
    renderScreen(new Y.Doc());

    expect(screen.getByText(/waiting for the game/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /alice/i })).not.toBeInTheDocument();
  });

  it('shows the seats as soon as the game arrives from a peer', async () => {
    const yDoc = new Y.Doc();
    renderScreen(yDoc);

    await act(async () => {
      await applySessionSnapshot(yDoc, snapshot(), createFakeCardLookup().service);
    });

    expect(await screen.findByRole('button', { name: /alice/i })).toBeInTheDocument();
  });

  it('offers a way out when nobody in the game is online', async () => {
    // A short real timeout rather than fake ones: `userEvent` schedules its own
    // timers, and mocking the clock out from under it deadlocks the click.
    const user = userEvent.setup();
    const { onJoinAsNew } = renderScreen(new Y.Doc(), { timeoutMs: 1 });

    expect(await screen.findByText(/couldn't reach the other player/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /join as a new player/i }));
    expect(onJoinAsNew).toHaveBeenCalled();
  });

  it('does not give up once the game has arrived', async () => {
    renderScreen(await restoredDoc(), { timeoutMs: 1 });

    // Awaiting the roster gives the give-up timer real time to fire if it were
    // ever armed — it isn't, because the game is already here.
    expect(await screen.findByRole('button', { name: /alice/i })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reach/i)).not.toBeInTheDocument();
  });

  it('lets the player bail out while still waiting', async () => {
    const user = userEvent.setup();
    const { onJoinAsNew } = renderScreen(new Y.Doc());

    await user.click(screen.getByRole('button', { name: /join as a new player/i }));

    expect(onJoinAsNew).toHaveBeenCalled();
  });
});
