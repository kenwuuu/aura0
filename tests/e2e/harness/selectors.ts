/**
 * Domain -> testid map. Nothing outside this file should hold a raw
 * `data-testid` string — page objects and interactions import from here so a
 * renamed testid is a one-line fix, not a grep-and-replace across specs.
 */

export const TESTID = {
  battlefieldCard: 'battlefield-card',
  battlefieldToken: 'battlefield-token',
  pile: 'pile',
  healthValue: 'health-value',
  handCard: 'hand-card',
  handCardsContainer: 'hand-cards-container',
  pileViewer: 'pile-viewer',
  pileViewerCard: 'pile-viewer-card',
  deckImportOpen: 'deck-import-open',
  deckImportModal: 'deck-import-modal',
  toolbar: 'toolbar',
  toolbarMore: 'toolbar-more',
  gameActionsToolbar: 'game-actions-toolbar',
  phoneHudGameActionsToggle: 'phone-hud-game-actions-toggle',
  phoneHudActionLogToggle: 'phone-hud-action-log-toggle',
  roomLink: 'room-link',
  newGameButton: 'new-game-button',
  connectionStatus: 'connection-status',
  peerCursor: 'peer-cursor',
} as const;

export type PileKind = 'deck' | 'discard' | 'exile' | 'hand' | 'sideboard';
