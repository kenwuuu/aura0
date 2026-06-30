/**
 * Action log types
 *
 * Every game event appended to the shared Y.Array action log is an ActionLogEntry.
 * The `text` field is a pre-rendered human-readable string so the panel can render
 * without re-deriving context. Actor names are resolved at render time from the
 * Yjs player map (names can change; IDs are stable and space-efficient to store).
 */

export type ActionLogType =
  | 'play_card'
  | 'draw'
  | 'move_to_pile'
  | 'tap'
  | 'flip'
  | 'copy'
  | 'delete'
  | 'spawn_token'
  | 'health'
  | 'shuffle'
  | 'mulligan'
  | 'reset'
  | 'untap_all'
  | 'add_card'
  | 'scry'
  | 'reveal'
  | 'search';

export interface ActionLogEntry {
  id: string;          // crypto.randomUUID() — unique across all peers
  actorId: string;     // stable playerId of the player who performed the action
  type: ActionLogType;
  text: string;        // human string, e.g. "played Lightning Bolt"
  ts: number;          // Date.now() at the time of the action
}
