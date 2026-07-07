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
 * Game instances come from gameInstanceStore, so no props/prop-drilling.
 */

import { useEffect, useRef } from 'react';
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import {
  getKeyBindingsForAction,
  HotkeyScope,
} from '@/features/hotkeys/hotkeys';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import { executeBattlefieldCardAction } from '@/features/battlefield/battlefieldCardActions';
import { triggerConfirmation } from '@/shared/utils/confirmation';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { usePileViewerHotkeyStore } from '@/features/game-dock/pileViewerHotkeyStore';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { KeywordToken } from '@/features/keyword-tokens/types';
import { spawnTokenAtPosition } from '@/features/battlefield/spawnToken';
import { logAction } from '@/features/action-log/actionLog';

export function useAllGameHotkeys() {
  const { player, yDoc, playerId, roomManager } = useGameInstance();

  const hoverTarget = useHotkeyStore((s) => s.hoverTarget);
  const isModalOpen = useHotkeyStore((s) => s.isModalOpen);
  const setAddCardModalOpen = useHotkeyStore((s) => s.setAddCardModalOpen);

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

  // --- Helpers ---
  const saveDeck = () => {
    if (player && roomManager) {
      DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
    }
  };

  const onBattlefield = (action: string) => {
    if (yDoc && playerId && t?.kind === 'battlefield') {
      const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      executeBattlefieldCardAction(action, t.id, yCards, yTokens, playerId);
    }
  };

  // Move the hovered hand card to another pile. `position` 0 = deck bottom,
  // omitted = deck top (Player.movePileCard defaults to Infinity).
  const handMove = (dest: 'discard' | 'exile' | 'deck', position?: number) => {
    if (!player || t?.kind !== 'hand') return;
    const card = player.getState().hand.find((c) => c.id === t.id);
    if (card) {
      player.movePileCard(card, 'hand', dest, position);
    }
  };

  // Move the top card of the hovered pile elsewhere. A move into the same
  // pile is a no-op (mirrors the old per-pile `enabled` guards).
  const pileMove = (dest: 'hand' | 'discard' | 'exile' | 'deck', position?: number) => {
    if (!player || t?.kind !== 'pile' || !t.pileType) return;
    if (t.pileType === dest) return;
    const card = player.peekTopOfPile(t.pileType);
    if (card) {
      player.movePileCard(card, t.pileType, dest, position);
    }
  };

  const tokenOp = (op: 'increment' | 'decrement' | 'delete') => {
    if (!yDoc || !playerId || t?.kind !== 'token') return;
    const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
    const token = yTokens.get(t.id);
    if (!token || token.ownerId !== playerId) return;
    if (op === 'delete') {
      yTokens.delete(t.id);
      logAction(yDoc, { actorId: playerId, type: 'delete', text: `removed a ${token.title} token` });
    } else if (op === 'increment') {
      const next = (token.count ?? 0) + 1;
      yTokens.set(t.id, { ...token, count: next });
      logAction(yDoc, { actorId: playerId, type: 'token_count', text: `set a ${token.title} token to ${next}` });
    } else {
      const next = (token.count ?? 0) - 1;
      if (next <= 0) {
        yTokens.delete(t.id);
        logAction(yDoc, { actorId: playerId, type: 'delete', text: `removed a ${token.title} token` });
      } else {
        yTokens.set(t.id, { ...token, count: next });
        logAction(yDoc, { actorId: playerId, type: 'token_count', text: `set a ${token.title} token to ${next}` });
      }
    }
  };

  // Route the move to the currently-open pile viewer, which owns the card list
  // and the source-pile-bound callbacks (see pileViewerHotkeyStore).
  const pileViewerMove = (action: string) => {
    if (t?.kind !== 'pileViewer') return;
    usePileViewerHotkeyStore.getState().actionHandler?.(action, t.id);
  };

  // ===========================================================================
  // Global shortcuts — fire whenever the Board scope is active (no hover needed)
  // ===========================================================================
  useHotkeys(getKeyBindingsForAction('draw'), () => {
    if (player) { player.drawCard(); saveDeck(); }
  }, board);

  useHotkeys(getKeyBindingsForAction('shuffle'), () => {
    if (player) { player.shuffleDeck(); saveDeck(); }
  }, board);

  useHotkeys(getKeyBindingsForAction('mulligan'), () => {
    if (player) {
      triggerConfirmation('Mulligan? Draws 7 new cards.', 'm').then((confirmed) => {
        if (confirmed) { player.mulligan(7); saveDeck(); }
      });
    }
  }, board);

  useHotkeys(getKeyBindingsForAction('addCard'), () => {
    setAddCardModalOpen(true);
  }, board);

  useHotkeys(getKeyBindingsForAction('gainHealth'), () => {
    player?.modifyHealth(1);
  }, board);

  useHotkeys(getKeyBindingsForAction('loseHealth'), () => {
    player?.modifyHealth(-1);
  }, board);

  useHotkeys(getKeyBindingsForAction('untapAll'), () => {
    if (yDoc && playerId) {
      const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      executeBattlefieldCardAction('untapAll', '', yCards, yTokens, playerId);
    }
  }, board);

  // ===========================================================================
  // Contextual shortcuts — one binding per key, routed by the hovered surface
  // ===========================================================================

  // Battlefield-only keys
  useHotkeys(getKeyBindingsForAction('tap'), () => onBattlefield('tap'),
    { ...board, enabled: isBattlefield });
  useHotkeys(getKeyBindingsForAction('addCounter'), () => {
    const { yDoc, playerId, screenToFlowPosition } = useGameInstance.getState();
    if (!yDoc || !playerId || !screenToFlowPosition) return;
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
    spawnTokenAtPosition(
      { title: '+1/+1', backgroundColor: '#e8e1df', count: 1 },
      screenToFlowPosition(cursorPos.current),
      yCards, yTokens, playerId,
    );
  }, board);
  useHotkeys(getKeyBindingsForAction('removeCounter'), () => {
    const { yDoc, playerId, screenToFlowPosition } = useGameInstance.getState();
    if (!yDoc || !playerId || !screenToFlowPosition) return;
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
    spawnTokenAtPosition(
      { title: '-1/-1', backgroundColor: '#e8e1df', count: -1 },
      screenToFlowPosition(cursorPos.current),
      yCards, yTokens, playerId,
    );
  }, board);
  useHotkeys(getKeyBindingsForAction('copy'), () => onBattlefield('copy'),
    { ...board, enabled: isBattlefield });

  // Flip — battlefield card or hand card
  useHotkeys(getKeyBindingsForAction('flip'), () => {
    if (isBattlefield) {
      onBattlefield('flip');
    } else if (isHand && player && t?.kind === 'hand') {
      player.flipHandCard(t.id);
      useCardPreviewStore.getState().hide();
    }
  }, { ...board, enabled: isBattlefield || isHand });

  // Backspace — delete battlefield card or delete token
  useHotkeys(getKeyBindingsForAction('delete'), () => {
    if (isBattlefield) onBattlefield('delete');
    else if (isToken) tokenOp('delete');
  }, { ...board, enabled: isBattlefield || isToken });

  // Move-to-hand (H) — battlefield card or pile top
  useHotkeys(getKeyBindingsForAction('moveToHand'), () => {
    if (isBattlefield) onBattlefield('moveToHand');
    else if (isPile) pileMove('hand');
  }, { ...board, enabled: isBattlefield || isPile });

  // Move-to-discard (D) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToDiscard'), () => {
    if (isBattlefield) onBattlefield('moveToDiscard');
    else if (isHand) handMove('discard');
    else if (isPile) pileMove('discard');
  }, { ...board, enabled: isBattlefield || isHand || isPile });

  // Move-to-exile (S) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToExile'), () => {
    if (isBattlefield) onBattlefield('moveToExile');
    else if (isHand) handMove('exile');
    else if (isPile) pileMove('exile');
  }, { ...board, enabled: isBattlefield || isHand || isPile });

  // Move-to-deck-top (T) — battlefield / hand / pile
  useHotkeys(getKeyBindingsForAction('moveToDeckTop'), () => {
    if (isBattlefield) onBattlefield('moveToDeckTop');
    else if (isHand) handMove('deck');
    else if (isPile) pileMove('deck');
  }, { ...board, enabled: isBattlefield || isHand || isPile });

  // Move-to-deck-bottom (Y) — battlefield / hand / pile (position 0)
  useHotkeys(getKeyBindingsForAction('moveToDeckBottom'), () => {
    if (isBattlefield) onBattlefield('moveToDeckBottom');
    else if (isHand) handMove('deck', 0);
    else if (isPile) pileMove('deck', 0);
  }, { ...board, enabled: isBattlefield || isHand || isPile });

  // Token counters
  useHotkeys(getKeyBindingsForAction('tokenIncrement'), () => tokenOp('increment'),
    { ...board, enabled: isToken });
  useHotkeys(getKeyBindingsForAction('tokenDecrement'), () => tokenOp('decrement'),
    { ...board, enabled: isToken });

  // ===========================================================================
  // Pile-viewer shortcuts — active only while the PileViewer scope is on.
  // Validity per pile type (e.g. discard can't move-to-discard) is decided by
  // PileViewerReact's dispatchPileMove, based on which callback it was given —
  // not duplicated here.
  // ===========================================================================
  useHotkeys(getKeyBindingsForAction('moveToHand'), () => pileViewerMove('moveToHand'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToDiscard'), () => pileViewerMove('moveToDiscard'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToExile'), () => pileViewerMove('moveToExile'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToDeckTop'), () => pileViewerMove('moveToDeckTop'),
    { ...pv, enabled: isPileViewer });
  useHotkeys(getKeyBindingsForAction('moveToDeckBottom'), () => pileViewerMove('moveToDeckBottom'),
    { ...pv, enabled: isPileViewer });
}

