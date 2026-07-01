/**
 * Game Action Types
 *
 * Declarative descriptor for any discrete action a player can perform.
 * Components only depend on GameAction; the MTG-specific registry (gameActions.ts)
 * is the game-specific layer. When this project evolves into a generic tabletop
 * engine, the registry moves with the game logic while the toolbar/menu stays.
 */

import * as Y from 'yjs';
import type { Player } from '@/features/player';
import type { WhiteboardCard } from '@/features/battlefield/types';

/** Everything an action's perform() might need. Built once by GameActionsToolbar. */
export interface GameActionContext {
  player: Player;
  yDoc: Y.Doc;
  playerId: string;
  yCards: Y.Map<WhiteboardCard>;
  yTokens: Y.Map<any>;
}

/**
 * Surface the action appears on:
 * - 'toolbar': standalone button in the top toolbar row
 * - 'actions': item in the Actions dropdown
 * - 'create': item in the Create dropdown
 */
export type GameActionSurface = 'toolbar' | 'actions' | 'create';

export interface GameAction {
  id: string;
  label: string;
  surface: GameActionSurface;
  /** If true, the menu item is rendered but non-interactive. */
  disabled?: boolean;
  /** Optional description for the disabled state (e.g. "coming soon"). */
  disabledReason?: string;
  /**
   * Execute the action. May open a modal via a Zustand store (e.g.
   * useNumberPromptStore.getState().open(...)) — keeps the signature sync.
   */
  perform: (ctx: GameActionContext) => void;
}
