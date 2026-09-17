import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { FOIL_STYLE_NEBULA, getIsEntitled, useCosmeticsStore } from './cosmeticsStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { Player } from '@/features/player';
import { makeCards } from '@/test/factories';

const reset = () => useCosmeticsStore.setState({ entitlements: {} });

const respondWith = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ status, json: async () => body } as Response);

describe('cosmeticsStore', () => {
  beforeEach(() => {
    reset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with nothing unlocked', () => {
    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(false);
  });

  it('unlocks the style the server named', async () => {
    vi.stubGlobal('fetch', respondWith(200, { valid: true, style: FOIL_STYLE_NEBULA }));

    await expect(useCosmeticsStore.getState().redeemCode('FOIL-7X2QF')).resolves.toBe('success');
    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(true);
  });

  it('reports a rejected code as invalid and unlocks nothing', async () => {
    vi.stubGlobal('fetch', respondWith(200, { valid: false }));

    await expect(useCosmeticsStore.getState().redeemCode('FOIL-NOPE1')).resolves.toBe('invalid');
    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(false);
  });

  it('never unlocks on a truthy-but-not-true valid field', async () => {
    // The response is parsed, not trusted. `valid: "yes"` must not unlock.
    vi.stubGlobal('fetch', respondWith(200, { valid: 'yes', style: FOIL_STYLE_NEBULA }));

    await expect(useCosmeticsStore.getState().redeemCode('FOIL-7X2QF')).resolves.toBe('invalid');
    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(false);
  });

  it('distinguishes a server failure from a bad code', async () => {
    // These lead the player somewhere different — "check the code" versus "try
    // again shortly" — so collapsing them would tell a paying customer their
    // real code was wrong.
    vi.stubGlobal('fetch', respondWith(503, {}));

    await expect(useCosmeticsStore.getState().redeemCode('FOIL-7X2QF')).resolves.toBe('error');
    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(false);
  });

  it('reports a network failure as an error, not an invalid code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(useCosmeticsStore.getState().redeemCode('FOIL-7X2QF')).resolves.toBe('error');
  });

  it('reports unparseable JSON as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response),
    );

    await expect(useCosmeticsStore.getState().redeemCode('FOIL-7X2QF')).resolves.toBe('error');
  });

  it('writes the unlock to storage in a shape it can read back', async () => {
    vi.stubGlobal('fetch', respondWith(200, { valid: true, style: FOIL_STYLE_NEBULA }));
    await useCosmeticsStore.getState().redeemCode('FOIL-7X2QF');

    expect(JSON.parse(localStorage.getItem('aura:cosmetics') ?? '{}')).toMatchObject({
      state: { entitlements: { [FOIL_STYLE_NEBULA]: true } },
      version: 1,
    });
  });

  it('comes back unlocked for a returning player', async () => {
    // The case that matters: a buyer redeemed yesterday and opens the app today.
    // Seeding storage and rehydrating is what a fresh boot actually does —
    // note `setState` cannot stand in for it, because this store persists on
    // every write, so clearing state in memory also clears it on disk.
    localStorage.setItem(
      'aura:cosmetics',
      JSON.stringify({ state: { entitlements: { [FOIL_STYLE_NEBULA]: true } }, version: 1 }),
    );

    await useCosmeticsStore.persist.rehydrate();

    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(true);
  });

  it('ignores everything in the blob except entitlements', async () => {
    // This is the key a curious player is most likely to hand-edit, and zustand
    // merges a saved blob over the defaults — so without a `merge` that reads
    // one field, a stored `redeemCode` would replace the function with a string
    // and break redemption for good. Editing this key should at worst grant a
    // cosmetic.
    localStorage.setItem(
      'aura:cosmetics',
      JSON.stringify({
        state: { entitlements: { [FOIL_STYLE_NEBULA]: true }, redeemCode: 'clobbered' },
        version: 1,
      }),
    );

    await useCosmeticsStore.persist.rehydrate();

    expect(typeof useCosmeticsStore.getState().redeemCode).toBe('function');
    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(true);
  });

  it('ignores a malformed entitlements value rather than throwing', async () => {
    localStorage.setItem(
      'aura:cosmetics',
      JSON.stringify({ state: { entitlements: 'not an object' }, version: 1 }),
    );

    await useCosmeticsStore.persist.rehydrate();

    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(false);
  });

  it('applies the style to cards already in play', async () => {
    // The whole reason the sweep is inside `redeemCode` rather than at the call
    // site. Fulfillment is manual, so the code always arrives long after the
    // deck was imported — a redemption that only affected future imports would
    // leave a buyer looking at a board unchanged from before they paid.
    const yDoc = new Y.Doc();
    const player = new Player('p1', yDoc, [], { initialHealth: 40 });
    player.getPile('hand').setCards([{ ...makeCards(1)[0], isFoil: true }]);
    useGameInstance.setState({ player });

    vi.stubGlobal('fetch', respondWith(200, { valid: true, style: FOIL_STYLE_NEBULA }));
    await useCosmeticsStore.getState().redeemCode('FOIL-7X2QF');

    expect(player.getPile('hand').getCards()[0].foil).toBe(FOIL_STYLE_NEBULA);
  });

  it('does not sweep when the code was rejected', async () => {
    const yDoc = new Y.Doc();
    const player = new Player('p1', yDoc, [], { initialHealth: 40 });
    player.getPile('hand').setCards([{ ...makeCards(1)[0], isFoil: true }]);
    useGameInstance.setState({ player });

    vi.stubGlobal('fetch', respondWith(200, { valid: false }));
    await useCosmeticsStore.getState().redeemCode('FOIL-NOPE1');

    expect(player.getPile('hand').getCards()[0].foil).toBeUndefined();
  });

  it('refreshes the per-room deck snapshot so a reload keeps the foils', async () => {
    // That snapshot is a second copy of the deck pile in localStorage, rewritten
    // only on deck load. Left alone it would hold the pre-purchase deck for its
    // whole 12-hour life and hand back unfoiled cards on the next boot that
    // falls back to it.
    const yDoc = new Y.Doc();
    const player = new Player('p1', yDoc, [], { initialHealth: 40 });
    player.getPile('deck').setCards([{ ...makeCards(1)[0], isFoil: true }]);
    useGameInstance.setState({
      player,
      roomManager: { getRoomName: () => 'room-1' } as never,
    });

    vi.stubGlobal('fetch', respondWith(200, { valid: true, style: FOIL_STYLE_NEBULA }));
    await useCosmeticsStore.getState().redeemCode('FOIL-7X2QF');

    const snapshot = JSON.parse(localStorage.getItem('aura-deck-state-room-1') ?? '{}');
    expect(snapshot.cards[0].foil).toBe(FOIL_STYLE_NEBULA);
  });

  it('redeems fine before a game exists', async () => {
    // Nothing guarantees a player is bootstrapped when a code is entered.
    useGameInstance.setState({ player: null });
    vi.stubGlobal('fetch', respondWith(200, { valid: true, style: FOIL_STYLE_NEBULA }));

    await expect(useCosmeticsStore.getState().redeemCode('FOIL-7X2QF')).resolves.toBe('success');
  });

  it('keeps only true entitlements, not any truthy value', async () => {
    localStorage.setItem(
      'aura:cosmetics',
      JSON.stringify({ state: { entitlements: { [FOIL_STYLE_NEBULA]: 'yes' } }, version: 1 }),
    );

    await useCosmeticsStore.persist.rehydrate();

    expect(getIsEntitled(FOIL_STYLE_NEBULA)).toBe(false);
  });

  it('keeps its own storage key, so seeding settings cannot wipe it', async () => {
    vi.stubGlobal('fetch', respondWith(200, { valid: true, style: FOIL_STYLE_NEBULA }));
    await useCosmeticsStore.getState().redeemCode('FOIL-7X2QF');

    localStorage.setItem('aura:settings', JSON.stringify({ state: { handZoom: 2 }, version: 1 }));

    expect(localStorage.getItem('aura:cosmetics')).toContain(FOIL_STYLE_NEBULA);
  });
});
