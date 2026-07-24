export const CARD_HEIGHT = 88;
export const CARD_WIDTH = 63;

// RoomManager
export const ROOM_PREFIX = 'mtg-';

// How long a room's local IndexedDB doc survives without being opened before it's collected
// (see infrastructure/networking/roomDocStorage.ts). The relay keeps no durable copy of a
// room, so this deletion is the game itself, not a cache — hence a deliberately generous TTL.
// A room nobody has opened in a month is abandoned; the cost of being wrong is someone's game.
export const ROOM_DOC_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Default card back image (will be added to /public/assets/)
export const DEFAULT_CARD_BACK = '/assets/card-back.png';

// yDoc constants
export const YDOC_CARDS_ON_BOARD = 'cards-on-board';
export const YDOC_KEYWORD_TOKENS = 'tokens';
export function YDOC_PLAYER(playerId: string): string { return `player-${playerId}` }
export const YSTATE_HEALTH = 'health';
export const YSTATE_DECK = 'deck';
export const YSTATE_HAND = 'hand';
export const YSTATE_EXILE_PILE = 'exile-pile';
export const YSTATE_DISCARD_PILE = 'discard-pile';
export const YSTATE_DECK_CARD_COUNT = 'deck-card-count';
export const YSTATE_CUSTOM_COUNTERS = 'custom-counters';
export const YSTATE_CAN_VIEW_HAND = 'allowViewHand';
export const YSTATE_SCRY = 'scry';
// Cards imported from a sideboard/maybeboard section. Private to their owner —
// opponents may see the count but never the contents (see PileNode).
export const YSTATE_SIDEBOARD = 'sideboard';
// 0=hidden, -1=all cards revealed, N>0=top N cards revealed (deck pile-viewer scry/surveil state)
export const YSTATE_DECK_REVEAL_COUNT = 'deckRevealCount';
// Player-chosen display name. Synced via Yjs so other peers see it. Distinct from the
// internal player ID (YDOC_PLAYER key / ownerId), which stays stable and private.
export const YSTATE_PLAYER_NAME = 'playerName';
// Player identity color. Seeded from colorFromPlayerId() on init; a future picker can
// overwrite it. Synced via Yjs so cursors, playmats, and chat all key off the same value.
export const YSTATE_PLAYER_COLOR = 'playerColor';
// Timestamp (Date.now()) written once on first init; determines stable seat order across peers.
export const YSTATE_JOINED_AT = 'joinedAt';
// Tombstone marking a seat as removed (a departed player kicked from the room).
// Yjs has no API to delete a top-level shared type, so a removed player's
// `YDOC_PLAYER(id)` map lingers in the doc forever; the seat enumerators
// (buildPlaymatNodes) skip any map carrying this flag instead. Cleared by
// Player's constructor on rejoin, so removal is a kick, not a ban. See
// features/player/removePlayer.ts.
export const YSTATE_REMOVED = 'removed';

// Action log: shared append-only Y.Array of ActionLogEntry objects.
// Using Y.Array (not a JS-array-in-a-Y.Map) so concurrent appends from different
// players are conflict-free — last-write-wins would silently drop entries.
export const YDOC_ACTION_LOG = 'action-log';
// Soft cap: trim to this many entries whenever a new one is appended.
// Bounds the per-peer doc download and IndexedDB size as rooms age.
export const ACTION_LOG_MAX_ENTRIES = 500;