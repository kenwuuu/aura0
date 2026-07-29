import { describe, it, expect } from 'vitest';
import {
  getMenuActionsForTarget,
  getHotkeysForContext,
  getHotkeysGroupedByZone,
  getToolbarActions,
  HOTKEYS,
  HotkeyContext,
  type ToolbarSurface,
} from './hotkeys';

/**
 * The context menu and the keyboard layer read the same `HOTKEYS` table, so a
 * hotkey whose `context` list omits a surface still *fires* there (the key
 * handler is global) while its menu row silently never renders. That drift is
 * invisible until someone right-clicks and finds the row missing — which is
 * exactly what happened to "To deck top"/"To deck bottom" in the deck viewer:
 * `T`/`Y` worked, their rows did not exist.
 *
 * These pin the move set each pile-viewer surface must offer by right-click.
 */
describe('pile-viewer context menus', () => {
  it('a deck-viewer card offers the full move set, including both deck moves', () => {
    const actions = getMenuActionsForTarget({
      kind: 'pileViewerCard',
      id: 'card-1',
      context: HotkeyContext.DeckCard,
    }).map((hotkey) => hotkey.action);

    // The two that were missing.
    expect(actions).toContain('moveToDeckTop');
    expect(actions).toContain('moveToDeckBottom');
    // The three that were already there — kept so a regression that drops the
    // whole deckcard context can't pass by removing everything.
    expect(actions).toEqual(
      expect.arrayContaining(['moveToHand', 'moveToDiscard', 'moveToExile']),
    );
  });

  it('every pile-viewer surface can send a card to the top or bottom of the deck', () => {
    // A card sitting in any pile viewer must be able to go back to the deck;
    // the scry viewer's whole purpose is ordering the top of the library.
    for (const context of [
      HotkeyContext.DeckCard,
      HotkeyContext.Discard,
      HotkeyContext.Exile,
      HotkeyContext.Scry,
    ]) {
      const actions = getHotkeysForContext(context).map((hotkey) => hotkey.action);

      expect(actions, `${context} should offer moveToDeckTop`).toContain('moveToDeckTop');
      expect(actions, `${context} should offer moveToDeckBottom`).toContain('moveToDeckBottom');
    }
  });

  it('offers "play to board facedown" on every pile-viewer card, and on no pile itself', () => {
    for (const context of [
      HotkeyContext.DeckCard,
      HotkeyContext.Discard,
      HotkeyContext.Exile,
      HotkeyContext.Sideboard,
      HotkeyContext.Scry,
    ]) {
      const actions = getMenuActionsForTarget({ kind: 'pileViewerCard', id: 'card-1', context })
        .map((hotkey) => hotkey.action);
      expect(actions, `${context} should offer playFacedown`).toContain('playFacedown');
    }

    // The per-pile contexts are shared with the board pile nodes, which act
    // blind on the top card. Playing face down is always a deliberate pick, so
    // the row must not leak onto the pile itself.
    for (const pileType of ['deck', 'exile', 'discard', 'sideboard'] as const) {
      const actions = getMenuActionsForTarget({ kind: 'pile', pileType }).map((h) => h.action);
      expect(actions, `the ${pileType} pile should not offer playFacedown`).not.toContain('playFacedown');
    }
  });

  it('offers "play to board" face up on every pile-viewer card, above its facedown twin', () => {
    for (const context of [
      HotkeyContext.DeckCard,
      HotkeyContext.Discard,
      HotkeyContext.Exile,
      HotkeyContext.Sideboard,
      HotkeyContext.Scry,
    ]) {
      const actions = getMenuActionsForTarget({ kind: 'pileViewerCard', id: 'card-1', context })
        .map((hotkey) => hotkey.action);

      expect(actions, `${context} should offer playToBattlefield`).toContain('playToBattlefield');
      // Face up is the common case, so it reads first. Catalog order decides
      // menu order, which is the only reason these two entries are adjacent.
      expect(actions.indexOf('playToBattlefield')).toBeLessThan(actions.indexOf('playFacedown'));
      // One entry, not two: the row a viewer card shows must be the same
      // catalog action the deck node's `P` fires, or they can drift apart.
      expect(actions.filter((a) => a === 'playToBattlefield')).toHaveLength(1);
    }
  });

  it('keeps "play to board" on the deck node and off the other pile nodes', () => {
    // Unlike its face-down twin, playing face up *is* a blind top-of-deck
    // action — but only for the deck. Exile/discard/sideboard are played from
    // by picking a card in the viewer, so their nodes must not gain the row
    // just because the pile-viewer context did.
    expect(
      getMenuActionsForTarget({ kind: 'pile', pileType: 'deck' }).map((h) => h.action),
    ).toContain('playToBattlefield');

    for (const pileType of ['exile', 'discard', 'sideboard'] as const) {
      const actions = getMenuActionsForTarget({ kind: 'pile', pileType }).map((h) => h.action);
      expect(actions, `the ${pileType} pile should not offer playToBattlefield`)
        .not.toContain('playToBattlefield');
    }
  });
});

/**
 * `getHotkeysGroupedByZone` backs the shortcut reference (Help modal's
 * Shortcuts tab + the command palette). It must show every keyboard-bound
 * action exactly once and land the common keys where a player would look.
 */
describe('getHotkeysGroupedByZone', () => {
  const groups = getHotkeysGroupedByZone();
  const zoneOf = (action: string) =>
    groups.find((g) => g.hotkeys.some((h) => h.action === action))?.zone;

  it('lists every keyboard-bound action exactly once', () => {
    const flat = groups.flatMap((g) => g.hotkeys.map((h) => h.action));
    expect(new Set(flat).size, 'no action appears in two zones').toBe(flat.length);

    // Every catalog entry that has a key to press must be reachable.
    const keyboardActions = HOTKEYS.filter((h) => h.key !== '').map((h) => h.action);
    expect(new Set(flat)).toEqual(new Set(keyboardActions));
  });

  it('omits pointer-only rows that have no keystroke to show', () => {
    // `viewPile` is a menu-only row (empty `key`/`keys`) — nothing to reference.
    const flat = groups.flatMap((g) => g.hotkeys.map((h) => h.action));
    expect(flat).not.toContain('viewPile');
  });

  it('groups keys where a player reaches for them', () => {
    expect(zoneOf('draw')).toBe('Global');
    expect(zoneOf('untapAll')).toBe('Global');
    // Shared card-movement keys surface under Hand, not buried under Battlefield.
    expect(zoneOf('moveToDiscard')).toBe('Hand');
    expect(zoneOf('moveToSideboard')).toBe('Hand');
    expect(zoneOf('tap')).toBe('Battlefield');
    expect(zoneOf('shuffle')).toBe('Piles');
    expect(zoneOf('tokenIncrement')).toBe('Tokens');
    expect(zoneOf('gainHealth')).toBe('Life');
  });

  it('preserves the declared zone order and drops empty zones', () => {
    expect(groups.map((g) => g.zone)).toEqual([
      'Global',
      'Hand',
      'Battlefield',
      'Piles',
      'Tokens',
      'Life',
    ]);
  });

  it('omits the toolbar-only actions, which have no keystroke either', () => {
    const flat = groups.flatMap((g) => g.hotkeys.map((h) => h.action));
    for (const action of ['scry', 'mill', 'pass', 'resetDeck', 'createTokenCard']) {
      expect(flat, `${action} has no key binding to reference`).not.toContain(action);
    }
  });
});

/**
 * The Game Actions toolbar is the catalog's third surface, alongside the
 * keyboard and the context menus. It used to be a *separate registry* with its
 * own `perform()` bodies, and the copies drifted: the toolbar's Mulligan skipped
 * the confirmation the M key showed, and "Exile Top"/"Look at Top" were second
 * implementations of rows the deck node already offered as "Exile"/"View".
 *
 * These pin the properties that unification is supposed to guarantee.
 */
describe('toolbar surface', () => {
  const SURFACES: ToolbarSurface[] = ['button', 'actions', 'create'];
  const toolbarEntries = HOTKEYS.filter((h) => h.toolbar);

  it('reaches every toolbar-flagged entry through exactly one surface', () => {
    const rendered = SURFACES.flatMap((s) => getToolbarActions(s));
    expect(rendered).toHaveLength(toolbarEntries.length);
    expect(new Set(rendered.map((h) => h.action)).size).toBe(toolbarEntries.length);
  });

  it('returns each surface in ascending declared order', () => {
    for (const surface of SURFACES) {
      const orders = getToolbarActions(surface).map((h) => h.toolbar.order);
      expect(orders, `${surface} is unsorted`).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size, `${surface} has a duplicate order`).toBe(orders.length);
    }
  });

  it('keeps the toolbar row order players already know', () => {
    const label = (h: { toolbar: { label?: string }; shortDescription: string }) =>
      h.toolbar.label ?? h.shortDescription;

    expect(getToolbarActions('button').map(label)).toEqual(['Untap All', 'Draw', 'Pass']);
    expect(getToolbarActions('actions').map(label)).toEqual([
      'Draw X', 'Scry', 'Surveil', 'Mill', 'Exile Top', 'View Deck',
      'Random Discard', 'Reveal Hand', 'Shuffle', 'Mulligan', 'Reset Deck',
    ]);
    expect(getToolbarActions('create').map(label)).toEqual(['Counter', 'Token Card', 'Label']);
  });

  it('gives the deck node the library actions the toolbar had to itself', () => {
    const deckRows = getMenuActionsForTarget({ kind: 'pile', pileType: 'deck' })
      .map((h) => h.action);

    // The four that were toolbar-only before the registries were unified.
    expect(deckRows).toEqual(expect.arrayContaining(['drawX', 'scry', 'surveil', 'mill']));
  });

  it('keeps toolbar-only actions off every context menu', () => {
    // No surface hovers "pass" or "reset deck", so they carry no context — an
    // empty list is the catalog's way of saying "toolbar only".
    for (const action of ['pass', 'randomDiscard', 'revealHand', 'resetDeck', 'createToken', 'createTokenCard', 'createLabel']) {
      const entry = HOTKEYS.find((h) => h.action === action);
      expect(entry, `${action} is missing from the catalog`).toBeDefined();
      expect(entry!.context, `${action} should be toolbar-only`).toEqual([]);
    }
  });

  it('flags the one toolbar row that throws the game away', () => {
    // Reset Deck is the only toolbar action that discards state you can't get
    // back. If a second one ever earns the flag, it should be a deliberate edit
    // here rather than something that quietly inherits the red styling.
    const destructive = HOTKEYS.filter((h) => h.toolbar && h.destructive).map((h) => h.action);
    expect(destructive).toEqual(['resetDeck']);
  });

  it('has no leftover duplicate of a row the deck node already owns', () => {
    // "Exile Top" and "Look at Top" were the duplicates; they are now the deck-
    // targeted toolbar placements of moveToExile and viewPile.
    const actions = HOTKEYS.map((h) => h.action);
    expect(actions).not.toContain('exileTop');
    expect(actions).not.toContain('lookAtTop');

    const deckTargeted = HOTKEYS.filter((h) => h.toolbar?.target === 'deck').map((h) => h.action);
    expect(deckTargeted).toEqual(['viewPile', 'moveToExile']);
  });
});
