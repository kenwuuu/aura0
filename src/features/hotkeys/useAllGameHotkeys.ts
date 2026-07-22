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
  useHotkeys(getKeyBindingsForAction('tap'), () => dispatch('tap'),
    { ...board, enabled: isBattlefield });
  useHotkeys(getKeyBindingsForAction('addCounter'), () => {
    dispatchGameAction('addCounter', { kind: 'board', ...cursorPos.current });
  }, board);
  useHotkeys(getKeyBindingsForAction('removeCounter'), () => {
    dispatchGameAction('removeCounter', { kind: 'board', ...cursorPos.current });
  }, board);
  useHotkeys(getKeyBindingsForAction('copy'), () => dispatch('copy'),
    { ...board, enabled: isBattlefield });

  // Flip — battlefield card or hand card
  useHotkeys(getKeyBindingsForAction('flip'), () => dispatch('flip'),
    { ...board, enabled: isBattlefield || isHand });

  // Backspace — delete battlefield card or delete token
  useHotkeys(getKeyBindingsForAction('delete'), () => {
    if (isBattlefield) dispatch('delete');
    else if (isToken) dispatch('tokenDelete');
  }, { ...board, enabled: isBattlefield || isToken });

  // Play-to-board (P) — top card of the deck straight onto the battlefield.
  // Gated to the deck specifically (not every pile like the moveTo* keys) to
  // match the catalog, which lists this row on the deck's menu only: exile and
  // discard get played from by picking a card in the pile viewer, not blind off
  // the top.
  useHotkeys(getKeyBindingsForAction('playToBattlefield'), () => dispatch('playToBattlefield'),
    { ...board, enabled: isPile && t?.pileType === 'deck' });

  // Move-to-hand (H) — battlefield card or pile top
  useHotkeys(getKeyBindingsForAction('moveToHand'), () => dispatch('moveToHand'),
    { ...board, enabled: isBattlefield || isPile });

  // Move-to-discard (D) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToDiscard'), () => dispatch('moveToDiscard'),
    { ...board, enabled: isBattlefield || isHand || isPile });

  // Move-to-exile (S) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToExile'), () => dispatch('moveToExile'),
    { ...board, enabled: isBattlefield || isHand || isPile });

  // Move-to-deck-top (T) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToDeckTop'), () => dispatch('moveToDeckTop'),
    { ...board, enabled: isBattlefield || isHand || isPile });

  // Move-to-deck-bottom (Y) — battlefield / hand / pile (position 0)
  useHotkeys(getKeyBindingsForAction('moveToDeckBottom'), () => dispatch('moveToDeckBottom'),
    { ...board, enabled: isBattlefield || isHand || isPile });

  // Move-to-sideboard (B) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToSideboard'), () => dispatch('moveToSideboard'),
    { ...board, enabled: isBattlefield || isHand || isPile });

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

