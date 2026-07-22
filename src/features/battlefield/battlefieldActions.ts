/**
 * Battlefield <-> pile game actions.
 *
 * Pulled out of gameInstanceStore so that store stays a pure DI/service-locator
 * (yDoc/player/playerId/roomManager/tokenService instances + setters) per the
 * "never put game mutations in Zustand" rule — these are the mutations. Each
 * export reads its instances from useGameInstance.getState(), the same DI
 * mechanism battlefieldCardActions/hotkeys/etc. already use.
 */
import * as Y from 'yjs';
import posthog from 'posthog-js';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { toBaseCard, type Card, type PileType } from '@/features/player';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS, CARD_WIDTH, CARD_HEIGHT } from '@/constants';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import type { TokenService } from '@/infrastructure/cards';
import type { Player } from '@/features/player';
import type { WhiteboardCard } from './types';
import type { KeywordToken } from '@/features/keyword-tokens/types';
import { logAction, cardLogName } from '@/features/action-log/actionLog';
import { getMaxZIndex, detachTokens } from './spawnToken';
import { firstFreeCascadeSlot } from './cascade';

// Shared by playCardFromHand and playCardFromPile: places a card at a flow
// position, logs the play, and spawns any related tokens. Playing a card has
// the same consequences regardless of which zone it came from — the caller
// only decides where the card lands and is responsible for having already
// removed it from its origin zone.
async function placeCardOnBattlefield(
  card: Card,
  position: { x: number; y: number },
  ctx: { yDoc: Y.Doc; playerId: string; player: Player; tokenService: TokenService | null },
  // Cascade off the target when something already sits there, instead of landing
  // exactly on top of it. Only for callers with no drag gesture behind them
  // (plays from a pile, which all aim at the same viewport centre and would
  // otherwise bury each card under the last). A hand drag must NOT set this: the
  // drop point is the player's explicit choice, and deliberately stacking cards —
  // an aura onto a creature, overlapping lands — is a thing people do.
  // `hand_drag_position.spec.ts` guards that a repeated drag to one point always
  // lands on that point.
  { cascade = false }: { cascade?: boolean } = {},
): Promise<void> {
  const { yDoc, playerId, player, tokenService } = ctx;
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const target = {
    x: position.x - CARD_WIDTH / 2,
    y: position.y - CARD_HEIGHT / 2,
  };
  const { x: cardX, y: cardY } = cascade ? firstFreeCascadeSlot(yCards, target) : target;

  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
  const maxZ = getMaxZIndex(yCards, yTokens);
  yCards.set(card.id, { ...card, x: cardX, y: cardY, zIndex: maxZ + 1, ownerId: playerId });
  posthog.capture('card_played_to_battlefield', { card_name: card.name, is_flipped: card.isFlipped });

  logAction(yDoc, {
    actorId: playerId,
    type: 'play_card',
    text: card.isFlipped ? `played a card face down` : `played ${card.name}`,
  });

  if (tokenService && card.scryfallId) {
    const result = await tokenService.createTokensForCard(card.scryfallId, { x: cardX, y: cardY });
    // A face-down card's tokens would reveal what it is, so keep them off the
    // battlefield and give the player the token cards in hand instead.
    if (card.isFlipped) {
      result.tokens.forEach((token) => {
        player.placeCardInPile(token, 'hand');
      });
    } else {
      result.tokens.forEach((token, i) => {
        yCards.set(token.id, { ...token, zIndex: maxZ + 2 + i, ownerId: playerId });
      });
    }
    if (result.errors.length > 0) {
      console.warn(`Token creation errors for ${card.name}:`, result.errors);
    }
  }
}

// Card movements off the battlefield (replaces the old window CustomEvent bus).
// Callers (battlefieldCardActions) already remove the card from the board; these
// are complete semantic actions — they strip battlefield-only fields, place the
// card in the destination pile (persisting the deck if needed), and log the move.
export function moveCardToHand(card: WhiteboardCard): void {
  const { player, yDoc, playerId } = useGameInstance.getState();
  if (!player || !yDoc || !playerId) return;
  player.placeCardInPile(toBaseCard(card), 'hand');
  logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `moved ${cardLogName(card)} to hand` });
}

export function moveCardToDiscard(card: WhiteboardCard): void {
  const { player, yDoc, playerId } = useGameInstance.getState();
  if (!player || !yDoc || !playerId) return;
  player.placeCardInPile(toBaseCard(card), 'discard');
  logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `moved ${cardLogName(card)} to discard` });
}

export function moveCardToExile(card: WhiteboardCard): void {
  const { player, yDoc, playerId } = useGameInstance.getState();
  if (!player || !yDoc || !playerId) return;
  player.placeCardInPile(toBaseCard(card), 'exile');
  logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `moved ${cardLogName(card)} to exile` });
}

export function moveCardToDeckTop(card: WhiteboardCard): void {
  const { player, roomManager, yDoc, playerId } = useGameInstance.getState();
  if (!player || !yDoc || !playerId) return;
  player.moveCardToDeckTop(toBaseCard(card));
  if (roomManager) {
    DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
  }
  logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `put ${cardLogName(card)} on top of deck` });
}

export function moveCardToDeckBottom(card: WhiteboardCard): void {
  const { player, roomManager, yDoc, playerId } = useGameInstance.getState();
  if (!player || !yDoc || !playerId) return;
  player.moveCardToDeckBottom(toBaseCard(card));
  if (roomManager) {
    DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
  }
  logAction(yDoc, { actorId: playerId, type: 'move_to_pile', text: `put ${cardLogName(card)} on bottom of deck` });
}

/**
 * Drag a card from the battlefield to a dock pile (replaces the old
 * moveCardFromBattlefield window event): detach any attached tokens, remove
 * it from the board, then delegate to the matching complete semantic action
 * above so drag-and-drop and hotkey/menu moves behave identically (same
 * stripped fields, same persistence, same log text).
 */
export function moveCardFromBattlefield(cardId: string, destination: PileType): void {
  const { yDoc, player, playerId } = useGameInstance.getState();
  if (!yDoc || !player || !playerId) return;
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
  const card = yCards.get(cardId);
  if (!card || card.ownerId !== playerId) return;

  detachTokens(cardId, yTokens);
  yCards.delete(cardId);

  switch (destination) {
    case 'hand': moveCardToHand(card); break;
    case 'discard': moveCardToDiscard(card); break;
    case 'exile': moveCardToExile(card); break;
    case 'deck': moveCardToDeckTop(card); break;
    // 'scry' is not a valid drag destination — no board drop target for it.
  }
}

/** Add a card to the battlefield (writes to yCards). */
export function addCardToBoard(card: Card, ownerId: string): void {
  const { yDoc } = useGameInstance.getState();
  if (!yDoc) return;
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
  const maxZIndex = getMaxZIndex(yCards, yTokens);
  yCards.set(card.id, { ...card, zIndex: maxZIndex + 1, ownerId });
}

/** Play a card from hand onto the battlefield: places the card and spawns any related tokens. */
export async function playCardFromHand(cardId: string, clientX: number, clientY: number): Promise<void> {
  const { yDoc, player, playerId, screenToFlowPosition, tokenService } = useGameInstance.getState();
  if (!yDoc || !player || !playerId || !screenToFlowPosition) return;
  const card = player.removeCardFromHand(cardId);
  if (!card) return;

  const position = screenToFlowPosition({ x: clientX, y: clientY });
  await placeCardOnBattlefield(card, position, { yDoc, playerId, player, tokenService });
}

/**
 * Play a card from a pile viewer (deck/exile/discard "play to battlefield") onto the
 * battlefield, spawning at the viewport center. Callers must have already removed the
 * card from its origin pile. Shares placement/logging/token-spawn with playCardFromHand
 * so a card has the same consequences regardless of which zone it was played from.
 */
export async function playCardFromPile(card: Card): Promise<void> {
  const { yDoc, player, playerId, screenToFlowPosition, tokenService } = useGameInstance.getState();
  if (!yDoc || !player || !playerId) return;

  // No drag gesture to anchor to when playing from a pile-viewer button, so
  // land the card at the center of the visible board — and cascade off that
  // center, since every play from a pile aims at the same spot.
  const position = screenToFlowPosition
    ? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    : { x: 300, y: 300 };
  await placeCardOnBattlefield(card, position, { yDoc, playerId, player, tokenService }, { cascade: true });
}
