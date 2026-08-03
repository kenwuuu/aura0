/**
 * Unified hook for all game hotkeys.
 *
 * One `useHotkeys` binding per key. The contextual routing (battlefield vs hand
 * vs pile vs token vs pile-viewer) happens *inside* each handler by reading the
 * single `hoverTarget` from the store, instead of registering the same action
 * once per surface. Modal gating is handled by react-hotkeys-hook scopes
 * (Board ↔ PileViewer ↔ Capture) rather than threading `!isModalOpen` through
 * every binding — see GameHotkeysManager for the <HotkeysProvider> that owns them.
 *
 * Game instances are read from gameInstanceStore inside the executors in
 * `gameActions.ts` — this hook itself only decides *which* action fires and
 * *what it targets*, never touches yDoc/player directly.
 *
 * **Which key** is not decided here either. Every registration resolves through
 * `useEffectiveBindings()`, so the player's preset and per-action overrides
 * apply live; the catalog's `keys` is only the fallback under both. Comments
 * below therefore name actions, never letters — "Move-to-discard", not "D".
 */

import { useEffect, useRef } from 'react';
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import {
  HotkeyContext,
  HotkeyScope,
  type MenuTarget,
} from '@/features/hotkeys/hotkeys';
import { dispatchGameAction } from '@/features/hotkeys/gameActions';
import { useEffectiveBindings } from '@/features/hotkeys/useHotkeyBindings';
import { getBinding } from '@/features/hotkeys/bindings';

export function useAllGameHotkeys() {
  const hoverTarget = useHotkeyStore((s) => s.hoverTarget);
  const isModalOpen = useHotkeyStore((s) => s.isModalOpen);
  const isCapturingHotkey = useHotkeyStore((s) => s.isCapturingHotkey);
  // Reactive so the battlefield `enabled` flags below re-evaluate when the
  // selection appears/clears: a selected group must accept board actions with
  // nothing hovered, which means those keys can't be gated on hover alone.
  const hasSelection = useHotkeyStore((s) => s.selectedCardIds.size > 0);

  // The player's effective bindings (preset + overrides), read live. Every
  // binding below resolves through `keys()` instead of the catalog, so a rebind
  // in Settings re-registers on the next render — rhk re-runs its effect when
  // the joined key string changes.
  const bindings = useEffectiveBindings();
  const keys = (action: string) => getBinding(bindings, action) as string[];
  // Guards every registration below. An action can resolve to no keys at all
  // (a preset that doesn't bind it, or a player who cleared it), and a key-less
  // `useHotkeys` would sit in the registry matching nothing — harmless today,
  // but it makes "is this action live?" unanswerable from the binding list.
  const bound = (action: string) => keys(action).length > 0;

  const { enableScope, disableScope } = useHotkeysContext();

  const cursorPos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => { cursorPos.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Modal state → active scope. Keep exactly one scope active at all times
  // (an empty active-scope set re-enables scoped bindings with a warning), and
  // enable the new scope before disabling the old to avoid a transient gap.
  //
  // Capture wins over the pile viewer: recording a key must silence everything,
  // and `Capture` has no bindings of its own, so it is the "no game hotkeys"
  // state written as a scope rather than as an empty set.
  useEffect(() => {
    const active = isCapturingHotkey
      ? HotkeyScope.Capture
      : isModalOpen
        ? HotkeyScope.PileViewer
        : HotkeyScope.Board;

    enableScope(active);
    for (const scope of [HotkeyScope.Board, HotkeyScope.PileViewer, HotkeyScope.Capture]) {
      if (scope !== active) disableScope(scope);
    }
  }, [isModalOpen, isCapturingHotkey, enableScope, disableScope]);

  // --- Shared option presets (per-binding `enabled` is spread in) ---
  const board = { scopes: HotkeyScope.Board, preventDefault: true } as const;
  const pv = { scopes: HotkeyScope.PileViewer, preventDefault: true } as const;

  // --- Current target, decomposed for `enabled` flags ---
  const t = hoverTarget;
  const isBattlefield = t?.kind === 'battlefield';
  const isHand = t?.kind === 'hand';
  const isPile = t?.kind === 'pile';
  const isToken = t?.kind === 'token';
  const isPileViewer = t?.kind === 'pileViewer';

  // Dispatch an action for the currently-hovered target. Every binding below
  // is a thin wrapper around this — the actual mutation logic lives in
  // `gameActions.ts`'s executors, shared with the right-click context menu.
  const dispatch = (action: string) => {
    if (!t) return;
    let target: MenuTarget | null = null;
    switch (t.kind) {
      case 'battlefield': target = { kind: 'battlefieldCard', id: t.id }; break;
      case 'hand': target = { kind: 'handCard', id: t.id }; break;
      case 'pile':
        // HOTKEY_PILE_KINDS (PileNode.tsx) only ever hovers deck/exile/discard.
        target = t.pileType && t.pileType !== 'scry' && t.pileType !== 'hand'
          ? { kind: 'pile', pileType: t.pileType }
          : null;
        break;
      case 'token': target = { kind: 'token', id: t.id }; break;
      case 'pileViewer': target = { kind: 'pileViewerCard', id: t.id, context: t.context ?? HotkeyContext.DeckCard }; break;
    }
    if (target) dispatchGameAction(action, target);
  };

  // Board battlefield-capable action. A hovered surface still wins — you can act
  // on the hand/pile/token/board card under the cursor — but with nothing
  // hovered the action falls to the multi-selection, so a selected group is
  // actionable without hovering a member. dispatchGameAction's membership rule
  // then fans it over the whole group. Board scope only: a selection is
  // battlefield state, meaningless in a pile, so pile-viewer keys keep `dispatch`.
  const dispatchOrSelection = (action: string) => {
    if (t) { dispatch(action); return; }
    const sel = useHotkeyStore.getState().selectedCardIds;
    if (sel.size > 0) dispatchGameAction(action, { kind: 'battlefieldCard', id: [...sel][0] });
  };

  // ===========================================================================
  // Global shortcuts — fire whenever the Board scope is active (no hover needed)
  // ===========================================================================
  useHotkeys(keys('draw'), () => {
    dispatchGameAction('draw', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('draw') });

  useHotkeys(keys('shuffle'), () => {
    dispatchGameAction('shuffle', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('shuffle') });

  useHotkeys(keys('mulligan'), () => {
    dispatchGameAction('mulligan', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('mulligan') });

  useHotkeys(keys('addCard'), () => {
    dispatchGameAction('addCard', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('addCard') });

  useHotkeys(keys('gainHealth'), () => {
    dispatchGameAction('gainHealth', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('gainHealth') });

  useHotkeys(keys('loseHealth'), () => {
    dispatchGameAction('loseHealth', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('loseHealth') });

  useHotkeys(keys('untapAll'), () => {
    dispatchGameAction('untapAll', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('untapAll') });

  // ===========================================================================
  // Contextual shortcuts — one binding per key, routed by the hovered surface
  // ===========================================================================

  // Battlefield-only keys
  useHotkeys(keys('tap'), () => dispatchOrSelection('tap'),
    { ...board, enabled: bound('tap') && (isBattlefield || hasSelection) });
  useHotkeys(keys('sick'), () => dispatchOrSelection('sick'),
    { ...board, enabled: bound('sick') && (isBattlefield || hasSelection) });
  // Counters aren't hover-routed like the rest: by default the counter keys
  // quick-drop a counter at the cursor. A multi-selection takes them over —
  // whether a member is hovered or nothing is — so each selected card gets its
  // own centered counter (matching the menu's card-anchored counter); the cursor
  // quick-drop remains only when there's no selection to act on.
  useHotkeys(keys('addCounter'), () => {
    const sel = useHotkeyStore.getState().selectedCardIds;
    if (isBattlefield && t && sel.has(t.id)) dispatch('addCounter');
    else if (!t && sel.size > 0) dispatchGameAction('addCounter', { kind: 'battlefieldCard', id: [...sel][0] });
    else dispatchGameAction('addCounter', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('addCounter') });
  useHotkeys(keys('removeCounter'), () => {
    const sel = useHotkeyStore.getState().selectedCardIds;
    if (isBattlefield && t && sel.has(t.id)) dispatch('removeCounter');
    else if (!t && sel.size > 0) dispatchGameAction('removeCounter', { kind: 'battlefieldCard', id: [...sel][0] });
    else dispatchGameAction('removeCounter', { kind: 'board', ...cursorPos.current });
  }, { ...board, enabled: bound('removeCounter') });
  useHotkeys(keys('copy'), () => dispatchOrSelection('copy'),
    { ...board, enabled: bound('copy') && (isBattlefield || hasSelection) });

  // Flip — battlefield card or hand card
  useHotkeys(keys('flip'), () => dispatchOrSelection('flip'),
    { ...board, enabled: bound('flip') && (isBattlefield || isHand || hasSelection) });

  // Delete — battlefield card, or the hovered token
  useHotkeys(keys('delete'), () => {
    if (isBattlefield) dispatch('delete');
    else if (isToken) dispatch('tokenDelete');
    else if (!t) {
      const sel = useHotkeyStore.getState().selectedCardIds;
      if (sel.size > 0) dispatchGameAction('delete', { kind: 'battlefieldCard', id: [...sel][0] });
    }
  }, { ...board, enabled: bound('delete') && (isBattlefield || isToken || hasSelection) });

  // Play-to-board — top card of the deck straight onto the battlefield.
  // Gated to the deck specifically (not every pile like the moveTo* keys) to
  // match the catalog, which lists this row on the deck's menu only: exile and
  // discard get played from by picking a card in the pile viewer, not blind off
  // the top.
  useHotkeys(keys('playToBattlefield'), () => dispatch('playToBattlefield'),
    { ...board, enabled: bound('playToBattlefield') && (isPile && t?.pileType === 'deck') });

  // Move-to-hand — battlefield card or pile top
  useHotkeys(keys('moveToHand'), () => dispatchOrSelection('moveToHand'),
    { ...board, enabled: bound('moveToHand') && (isBattlefield || isPile || hasSelection) });

  // Move-to-discard — battlefield / hand / pile
  useHotkeys(keys('moveToDiscard'), () => dispatchOrSelection('moveToDiscard'),
    { ...board, enabled: bound('moveToDiscard') && (isBattlefield || isHand || isPile || hasSelection) });

  // Move-to-exile — battlefield / hand / pile
  useHotkeys(keys('moveToExile'), () => dispatchOrSelection('moveToExile'),
    { ...board, enabled: bound('moveToExile') && (isBattlefield || isHand || isPile || hasSelection) });

  // Move-to-deck-top — battlefield / hand / pile
  useHotkeys(keys('moveToDeckTop'), () => dispatchOrSelection('moveToDeckTop'),
    { ...board, enabled: bound('moveToDeckTop') && (isBattlefield || isHand || isPile || hasSelection) });

  // Move-to-deck-bottom — battlefield / hand / pile (position 0)
  useHotkeys(keys('moveToDeckBottom'), () => dispatchOrSelection('moveToDeckBottom'),
    { ...board, enabled: bound('moveToDeckBottom') && (isBattlefield || isHand || isPile || hasSelection) });

  // Move-to-sideboard — battlefield / hand / pile
  useHotkeys(keys('moveToSideboard'), () => dispatchOrSelection('moveToSideboard'),
    { ...board, enabled: bound('moveToSideboard') && (isBattlefield || isHand || isPile || hasSelection) });

  // Token counters
  useHotkeys(keys('tokenIncrement'), () => dispatch('tokenIncrement'),
    { ...board, enabled: bound('tokenIncrement') && (isToken) });
  useHotkeys(keys('tokenDecrement'), () => dispatch('tokenDecrement'),
    { ...board, enabled: bound('tokenDecrement') && (isToken) });

  // ===========================================================================
  // Pile-viewer shortcuts — active only while the PileViewer scope is on.
  // Validity per pile type (e.g. discard can't move-to-discard) is decided by
  // PileViewerReact's dispatchPileMove, based on which callback it was given —
  // not duplicated here.
  // ===========================================================================
  useHotkeys(keys('moveToHand'), () => dispatch('moveToHand'),
    { ...pv, enabled: bound('moveToHand') && (isPileViewer) });
  useHotkeys(keys('moveToDiscard'), () => dispatch('moveToDiscard'),
    { ...pv, enabled: bound('moveToDiscard') && (isPileViewer) });
  useHotkeys(keys('moveToExile'), () => dispatch('moveToExile'),
    { ...pv, enabled: bound('moveToExile') && (isPileViewer) });
  useHotkeys(keys('moveToDeckTop'), () => dispatch('moveToDeckTop'),
    { ...pv, enabled: bound('moveToDeckTop') && (isPileViewer) });
  useHotkeys(keys('moveToDeckBottom'), () => dispatch('moveToDeckBottom'),
    { ...pv, enabled: bound('moveToDeckBottom') && (isPileViewer) });
  useHotkeys(keys('moveToSideboard'), () => dispatch('moveToSideboard'),
    { ...pv, enabled: bound('moveToSideboard') && (isPileViewer) });
}

