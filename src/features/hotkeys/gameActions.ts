/**
 * Unified game-action dispatch.
 *
 * `dispatchGameAction` is the single entry point invoked by both the keyboard
 * hotkeys (`useAllGameHotkeys`) and the right-click context menu
 * (`GameContextMenu`), so the two surfaces can never drift — a new action or
 * a bugfix here is automatically live on both. Each `MenuTarget` kind
 * delegates to a standalone executor, mirroring the existing
 * `executeBattlefieldCardAction` pattern that battlefield cards already used
 * for the same reason.
 *
 * All executors read their instances from `useGameInstance.getState()` (the
 * same DI mechanism `battlefieldActions.ts`/`spawnToken.ts` already use) —
 * never put game mutations in Zustand itself.
 */

import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useContextMenuStore } from './contextMenuStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { executeBattlefieldCardAction } from '@/features/battlefield/battlefieldCardActions';
import { isHiddenFacedown } from '@/features/battlefield/nodes/cardNodeLogic';
import { spawnTokenAtPosition } from '@/features/battlefield/spawnToken';
import { playCardFromPile } from '@/features/battlefield/battlefieldActions';
import { applyTokenDelta } from '@/features/battlefield/nodes/tokenNodeLogic';
import { usePileViewerHotkeyStore } from '@/features/game-dock/pileViewerHotkeyStore';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import { triggerConfirmation } from '@/shared/utils/confirmation';
import { logAction, cardLogName } from '@/features/action-log/actionLog';
import { useConfirmStore } from '@/app/stores/confirmStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import type * as Y from 'yjs';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { KeywordToken } from '@/features/keyword-tokens/types';
import type { PileType } from '@/features/player';
import type { MenuTarget } from './hotkeys';

/**
 * The action ids ('draw', 'shuffle', ...) that fire from the global scope
 * regardless of what's hovered — same set the "Global shortcuts" block in
 * `useAllGameHotkeys` binds unconditionally. A deck pile's context menu also
 * surfaces these (its `HotkeyContext` is tagged 'global' too), so a click
 * there must route here rather than into `executePileAction`.
 */
const GLOBAL_ACTIONS = new Set([
  'draw', 'shuffle', 'mulligan', 'addCard',
  'gainHealth', 'loseHealth', 'untapAll',
  'addCounter', 'removeCounter',
]);

/** dest pile + insert position for the shared moveTo* action family. `position`
 * 0 = deck bottom, undefined = top (Player.movePileCard defaults to Infinity). */
function resolveMoveDestination(action: string): { dest: PileType; position?: number } | null {
  switch (action) {
    case 'moveToHand': return { dest: 'hand' };
    case 'moveToDiscard': return { dest: 'discard' };
    case 'moveToExile': return { dest: 'exile' };
    case 'moveToDeckTop': return { dest: 'deck' };
    case 'moveToDeckBottom': return { dest: 'deck', position: 0 };
    case 'moveToSideboard': return { dest: 'sideboard' };
    default: return null;
  }
}

/** Flip or move a card in hand to another pile. */
function executeHandCardAction(action: string, cardId: string): void {
  const { player } = useGameInstance.getState();
  if (!player) return;

  if (action === 'flip') {
    player.flipHandCard(cardId);
    useCardPreviewStore.getState().hide();
    return;
  }

  const move = resolveMoveDestination(action);
  if (!move) return;
  const card = player.getState().hand.find((c) => c.id === cardId);
  if (card) player.movePileCard(card, 'hand', move.dest, move.position);
}

/** Play the top card of a pile onto the battlefield. Removing the card here
 * (rather than in playCardFromPile) matches the pile-viewer's play button,
 * which also owns the removal from its own pile — playCardFromPile only ever
 * places an already-detached card. */
function executePlayTopOfPile(pileType: PileType): void {
  const { player, roomManager } = useGameInstance.getState();
  if (!player) return;

  const card = player.drawCardFromPile(pileType);
  if (!card) return;
  // Not awaited: the card lands on the board synchronously; only its related
  // tokens are fetched async (same as every other play path).
  void playCardFromPile(card);
  // Same persistence the 'draw' action does: the deck shrank, so the saved
  // deck for this room has to shrink with it.
  if (pileType === 'deck' && roomManager) {
    DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
  }
}

/** Move the top card of a battlefield pile (deck/exile/discard) elsewhere.
 * A move into the same pile is a no-op. */
function executePileAction(action: string, pileType: PileType): void {
  const { player } = useGameInstance.getState();
  if (!player) return;

  if (action === 'playToBattlefield') {
    executePlayTopOfPile(pileType);
    return;
  }

  const move = resolveMoveDestination(action);
  if (!move || move.dest === pileType) return;
  const card = player.peekTopOfPile(pileType);
  if (card) player.movePileCard(card, pileType, move.dest, move.position);
}

/** Gain/lose 1 life for the local player. */
function executeHealthAction(action: string): void {
  const { player } = useGameInstance.getState();
  if (!player) return;

  if (action === 'gainHealth') player.modifyHealth(1);
  else if (action === 'loseHealth') player.modifyHealth(-1);
}

/** Increment/decrement/delete a battlefield keyword token. Only its owner may act. */
function executeTokenAction(action: string, tokenId: string): void {
  const { yDoc, playerId } = useGameInstance.getState();
  if (!yDoc || !playerId) return;
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
  const token = yTokens.get(tokenId);
  if (!token || token.ownerId !== playerId) return;

  if (action === 'tokenDelete') {
    yTokens.delete(tokenId);
    logAction(yDoc, { actorId: playerId, type: 'delete', text: `removed a ${token.title} token` });
    return;
  }

  if (action !== 'tokenIncrement' && action !== 'tokenDecrement') return;
  const delta = action === 'tokenIncrement' ? 1 : -1;
  // Adjust the count in place, mirroring the click-to-adjust path
  // (`applyTokenDelta`, used by TokenNode). Decrementing to 0 or below no
  // longer deletes the token — removal is only ever the explicit `tokenDelete`
  // (Backspace / the menu's Delete row).
  const next = applyTokenDelta(token.count, delta);
  yTokens.set(tokenId, { ...token, count: next });
  logAction(yDoc, { actorId: playerId, type: 'token_count', text: `set a ${token.title} token to ${next}` });
}

/** Global/board actions: draw, shuffle, mulligan, add-card, untap-all, and
 * cursor-anchored counter-token spawns. `cursor` is the screen position to
 * spawn +1/+1 / -1/-1 tokens at (mouse position for a keyboard press, the
 * click position for a board-pane right-click). */
function executeBoardAction(action: string, cursor: { x: number; y: number }): void {
  const { player, yDoc, playerId, roomManager, screenToFlowPosition } = useGameInstance.getState();

  const saveDeck = () => {
    if (player && roomManager) {
      DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
    }
  };

  switch (action) {
    case 'draw':
      if (player) { player.drawCard(); saveDeck(); }
      break;
    case 'shuffle':
      if (player) { player.shuffleDeck(); saveDeck(); }
      break;
    case 'mulligan':
      if (player) {
        triggerConfirmation('Mulligan? Draws 7 new cards.', 'm').then((confirmed) => {
          if (confirmed) { player.mulligan(7); saveDeck(); }
        });
      }
      break;
    case 'addCard':
      useHotkeyStore.getState().setAddCardModalOpen(true);
      break;
    case 'gainHealth':
    case 'loseHealth':
      executeHealthAction(action);
      break;
    case 'untapAll':
      if (yDoc && playerId) {
        const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
        const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
        executeBattlefieldCardAction('untapAll', '', yCards, yTokens, playerId);
      }
      break;
    case 'addCounter':
    case 'removeCounter': {
      if (!yDoc || !playerId || !screenToFlowPosition) break;
      const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      const template = action === 'addCounter'
        ? { title: '+1/+1', backgroundColor: '#e8e1df', count: 1 }
        : { title: '-1/-1', backgroundColor: '#e8e1df', count: -1 };
      spawnTokenAtPosition(template, screenToFlowPosition(cursor), yCards, yTokens, playerId);
      break;
    }
  }
}

/**
 * Peek at your own facedown card's hidden (front) face. This is a **local-only**
 * preview — it writes nothing to Yjs, so the board card stays face-down to
 * everyone and opponents see nothing (no board-state flip, no unflip timeout).
 *
 * Gated to the card's owner and to facedown cards; a no-op otherwise, so it can
 * never leak an opponent's hidden information. `GameContextMenu` applies the
 * same gate to decide whether to even show the row.
 */
function executePeek(cardId: string): void {
  const { yDoc, playerId } = useGameInstance.getState();
  if (!yDoc || !playerId) return;
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const card = yCards.get(cardId);
  if (!card || card.ownerId !== playerId || !isHiddenFacedown(card)) return;

  // Anchor the preview at the point the menu was opened from (tap/cursor
  // position) so its left/right placement is sensible on touch and mouse alike.
  const { x, y } = useContextMenuStore.getState();
  useCardPreviewStore.getState().updatePosition(x, y);

  // Preview an *unflipped* copy so the front face renders (see
  // CardPreview.selectPreviewImage). Only this local copy is unflipped — the
  // shared board card is untouched. The source watcher auto-hides the preview
  // once the card leaves the board.
  useCardPreviewStore.getState().show(
    { ...card, isFlipped: false },
    { yMap: yCards, isPresent: () => yCards.has(cardId) },
  );
}

/**
 * Ask before deleting, then run `performDelete` if the player says yes.
 *
 * Delete is the only battlefield action that destroys a card outright — every
 * moveTo* puts it in a pile you can dig it back out of, and there is no undo
 * stack — while sitting on Backspace, which is easy to hit by accident. Gated
 * on the `confirmCardDelete` preference, which the dialog's "Don't ask again"
 * checkbox turns off (same setting as Settings › Display).
 *
 * This lives at the dispatch layer rather than inside
 * `executeBattlefieldCardAction` because confirmation is async and the
 * executor is called inside a `yDoc.transact` once per selected card — the
 * question is about the whole batch, and it has to be asked before the
 * transaction opens.
 */
function confirmThenDelete(
  ids: string[],
  yCards: Y.Map<WhiteboardCard>,
  performDelete: () => void,
): void {
  // The 'delete' executor closes the menu itself, but that now happens only
  // after the dialog is answered — close it up front so it isn't left sitting
  // under the modal (or, on cancel, sitting there forever).
  useContextMenuStore.getState().close();

  const first = yCards.get(ids[0]);
  // cardLogName keeps a face-down card anonymous ("a face-down card"), which
  // matters even in your own dialog: it may be an opponent's card.
  const subject = ids.length > 1
    ? `${ids.length} cards`
    : (first ? cardLogName(first) : 'this card');

  useConfirmStore.getState().open({
    title: ids.length > 1 ? `Delete ${ids.length} cards?` : 'Delete card?',
    description: `Removes ${subject} from the battlefield. Deleted cards don't go to a pile, and this can't be undone.`,
    confirmLabel: 'Delete',
    destructive: true,
    dontAskAgainLabel: "Don't ask again",
    onSuppress: () => useSettingsStore.getState().setConfirmCardDelete(false),
    onConfirm: performDelete,
  });
}

/**
 * Route an action id (from `hotkeys.ts`'s `Hotkey.action`) to the executor
 * for the given target. Called by keyboard bindings (`useAllGameHotkeys`)
 * and by `GameContextMenu` on item click — the only two callers, so both
 * always agree on what an action does.
 */
export function dispatchGameAction(action: string, target: MenuTarget): void {
  switch (target.kind) {
    case 'battlefieldCard': {
      // Peek is a local-only preview, not a board mutation, so it's handled
      // here rather than in executeBattlefieldCardAction (which owns Yjs writes).
      if (action === 'peek') { executePeek(target.id); return; }
      const { yDoc, playerId } = useGameInstance.getState();
      if (!yDoc || !playerId) return;
      const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      // Membership rule: when the acted-on card is part of a multi-selection,
      // fan the action out over the whole group; otherwise it targets just this
      // card. `untapAll` already sweeps every owned card, so never loop it.
      const selected = useHotkeyStore.getState().selectedCardIds;
      const ids = action !== 'untapAll' && selected.size > 1 && selected.has(target.id)
        ? [...selected]
        : [target.id];
      // One transaction → one undo step and one observer rebuild for the batch
      // (also batches the hand/deck writes the moveTo* actions delegate to).
      const perform = () => yDoc.transact(() => {
        for (const id of ids) executeBattlefieldCardAction(action, id, yCards, yTokens, playerId);
      });
      if (action === 'delete' && useSettingsStore.getState().confirmCardDelete) {
        confirmThenDelete(ids, yCards, perform);
        return;
      }
      perform();
      return;
    }
    case 'handCard':
      executeHandCardAction(action, target.id);
      return;
    case 'pile':
      if (action === 'viewPile') {
        // Only local piles carry a menu (see PileNode), so the viewer request
        // is always local-scoped.
        usePileViewerOpenStore.getState().open({ scope: 'local', pile: target.pileType });
      } else if (GLOBAL_ACTIONS.has(action)) {
        // Deck pile menu also surfaces draw/shuffle/mulligan/addCard (its
        // HotkeyContext is tagged 'global' too) — route those to the board
        // executor instead of the pile-move executor.
        executeBoardAction(action, { x: 0, y: 0 });
      } else {
        executePileAction(action, target.pileType);
      }
      return;
    case 'token':
      executeTokenAction(action, target.id);
      return;
    case 'health':
      executeHealthAction(action);
      return;
    case 'board':
      executeBoardAction(action, { x: target.x, y: target.y });
      return;
    case 'pileViewerCard':
      usePileViewerHotkeyStore.getState().actionHandler?.(action, target.id);
      return;
  }
}
