/**
 * Unified hook for all game hotkeys.
 *
 * One `useHotkeys` binding per key. The contextual routing (battlefield vs hand
 * vs pile vs token vs pile-viewer) happens *inside* each handler by reading the
 * single `hoverTarget` from the store, instead of registering the same action
 * once per surface. Modal gating is handled by react-hotkeys-hook scopes
 * (Board ↔ PileViewer) rather than threading `!isModalOpen` through every
 * binding — see GameHotkeysManager for the <HotkeysProvider> that owns them.
 *
 * Game instances are read from gameInstanceStore inside the executors in
 * `gameActions.ts` — this hook itself only decides *which* action fires and
 * *what it targets*, never touches yDoc/player directly.
 */

import { useEffect, useRef } from 'react';
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import {
  getKeyBindingsForAction,
  HotkeyContext,
  HotkeyScope,
  type MenuTarget,
} from '@/features/hotkeys/hotkeys';
import { dispatchGameAction } from '@/features/hotkeys/gameActions';

export function useAllGameHotkeys() {
  const hoverTarget = useHotkeyStore((s) => s.hoverTarget);
  const isModalOpen = useHotkeyStore((s) => s.isModalOpen);
  // Reactive so the battlefield `enabled` flags below re-evaluate when the
  // selection appears/clears: a selected group must accept board actions with
  // nothing hovered, which means those keys can't be gated on hover alone.
  const hasSelection = useHotkeyStore((s) => s.selectedCardIds.size > 0);

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
  useEffect(() => {
    if (isModalOpen) {
      enableScope(HotkeyScope.PileViewer);
      disableScope(HotkeyScope.Board);
    } else {
      enableScope(HotkeyScope.Board);
      disableScope(HotkeyScope.PileViewer);
    }
  }, [isModalOpen, enableScope, disableScope]);

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
  useHotkeys(getKeyBindingsForAction('draw'), () => {
    dispatchGameAction('draw', { kind: 'board', ...cursorPos.current });
  }, board);

  useHotkeys(getKeyBindingsForAction('shuffle'), () => {
    dispatchGameAction('shuffle', { kind: 'board', ...cursorPos.current });
  }, board);

  useHotkeys(getKeyBindingsForAction('mulligan'), () => {
    dispatchGameAction('mulligan', { kind: 'board', ...cursorPos.current });
  }, board);

  useHotkeys(getKeyBindingsForAction('addCard'), () => {
    dispatchGameAction('addCard', { kind: 'board', ...cursorPos.current });
  }, board);

  useHotkeys(getKeyBindingsForAction('gainHealth'), () => {
    dispatchGameAction('gainHealth', { kind: 'board', ...cursorPos.current });
  }, board);

  useHotkeys(getKeyBindingsForAction('loseHealth'), () => {
    dispatchGameAction('loseHealth', { kind: 'board', ...cursorPos.current });
  }, board);

  useHotkeys(getKeyBindingsForAction('untapAll'), () => {
    dispatchGameAction('untapAll', { kind: 'board', ...cursorPos.current });
  }, board);

  // ===========================================================================
  // Contextual shortcuts — one binding per key, routed by the hovered surface
  // ===========================================================================

  // Battlefield-only keys
  useHotkeys(getKeyBindingsForAction('tap'), () => dispatchOrSelection('tap'),
    { ...board, enabled: isBattlefield || hasSelection });
  useHotkeys(getKeyBindingsForAction('sick'), () => dispatchOrSelection('sick'),
    { ...board, enabled: isBattlefield || hasSelection });
  // Counters aren't hover-routed like the rest: by default 'u'/'i' quick-drop a
  // counter at the cursor. A multi-selection takes over that key — whether a
  // member is hovered or nothing is — so each selected card gets its own centered
  // counter (matching the menu's card-anchored counter); the cursor quick-drop
  // remains only when there's no selection to act on.
  useHotkeys(getKeyBindingsForAction('addCounter'), () => {
    const sel = useHotkeyStore.getState().selectedCardIds;
    if (isBattlefield && t && sel.has(t.id)) dispatch('addCounter');
    else if (!t && sel.size > 0) dispatchGameAction('addCounter', { kind: 'battlefieldCard', id: [...sel][0] });
    else dispatchGameAction('addCounter', { kind: 'board', ...cursorPos.current });
  }, board);
  useHotkeys(getKeyBindingsForAction('removeCounter'), () => {
    const sel = useHotkeyStore.getState().selectedCardIds;
    if (isBattlefield && t && sel.has(t.id)) dispatch('removeCounter');
    else if (!t && sel.size > 0) dispatchGameAction('removeCounter', { kind: 'battlefieldCard', id: [...sel][0] });
    else dispatchGameAction('removeCounter', { kind: 'board', ...cursorPos.current });
  }, board);
  useHotkeys(getKeyBindingsForAction('copy'), () => dispatchOrSelection('copy'),
    { ...board, enabled: isBattlefield || hasSelection });

  // Flip — battlefield card or hand card
  useHotkeys(getKeyBindingsForAction('flip'), () => dispatchOrSelection('flip'),
    { ...board, enabled: isBattlefield || isHand || hasSelection });

  // Backspace — delete battlefield card or delete token
  useHotkeys(getKeyBindingsForAction('delete'), () => {
    if (isBattlefield) dispatch('delete');
    else if (isToken) dispatch('tokenDelete');
    else if (!t) {
      const sel = useHotkeyStore.getState().selectedCardIds;
      if (sel.size > 0) dispatchGameAction('delete', { kind: 'battlefieldCard', id: [...sel][0] });
    }
  }, { ...board, enabled: isBattlefield || isToken || hasSelection });

  // Play-to-board (P) — top card of the deck straight onto the battlefield.
  // Gated to the deck specifically (not every pile like the moveTo* keys) to
  // match the catalog, which lists this row on the deck's menu only: exile and
  // discard get played from by picking a card in the pile viewer, not blind off
  // the top.
  useHotkeys(getKeyBindingsForAction('playToBattlefield'), () => dispatch('playToBattlefield'),
    { ...board, enabled: isPile && t?.pileType === 'deck' });

  // Move-to-hand (H) — battlefield card or pile top
  useHotkeys(getKeyBindingsForAction('moveToHand'), () => dispatchOrSelection('moveToHand'),
    { ...board, enabled: isBattlefield || isPile || hasSelection });

  // Move-to-discard (D) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToDiscard'), () => dispatchOrSelection('moveToDiscard'),
    { ...board, enabled: isBattlefield || isHand || isPile || hasSelection });

  // Move-to-exile (S) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToExile'), () => dispatchOrSelection('moveToExile'),
    { ...board, enabled: isBattlefield || isHand || isPile || hasSelection });

  // Move-to-deck-top (T) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToDeckTop'), () => dispatchOrSelection('moveToDeckTop'),
    { ...board, enabled: isBattlefield || isHand || isPile || hasSelection });

  // Move-to-deck-bottom (Y) — battlefield / hand / pile (position 0)
  useHotkeys(getKeyBindingsForAction('moveToDeckBottom'), () => dispatchOrSelection('moveToDeckBottom'),
    { ...board, enabled: isBattlefield || isHand || isPile || hasSelection });

  // Move-to-sideboard (B) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToSideboard'), () => dispatchOrSelection('moveToSideboard'),
    { ...board, enabled: isBattlefield || isHand || isPile || hasSelection });

  // Token counters
  useHotkeys(getKeyBindingsForAction('tokenIncrement'), () => dispatch('tokenIncrement'),
    { ...board, enabled: isToken });
  useHotkeys(getKeyBindingsForAction('tokenDecrement'), () => dispatch('tokenDecrement'),
    { ...board, enabled: isToken });

  // ===========================================================================
  // Pile-viewer shortcuts — active only while the PileViewer scope is on.
  // Validity per pile type (e.g. discard can't move-to-discard) is decided by
  // PileViewerReact's dispatchPileMove, based on which callback it was given —
  // not duplicated here.
  // ===========================================================================
  useHotkeys(getKeyBindingsForAction('moveToHand'), () => dispatch('moveToHand'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToDiscard'), () => dispatch('moveToDiscard'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToExile'), () => dispatch('moveToExile'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToDeckTop'), () => dispatch('moveToDeckTop'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToDeckBottom'), () => dispatch('moveToDeckBottom'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToSideboard'), () => dispatch('moveToSideboard'),
    { ...pv, enabled: isPileViewer });
}

