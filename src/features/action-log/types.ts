/**
 * Action log types
 *
 * Every game event appended to the shared Y.Array action log is an ActionLogEntry.
 * The `text` field is a pre-rendered human-readable string so the panel can render
 * without re-deriving context. Actor names are resolved at render time from the
 * Yjs player map (names can change; IDs are stable and space-efficient to store).
 */

export type ActionLogType =
  | 'join'
  | 'play_card'
  | 'draw'
  | 'move_to_pile'
  | 'tap'
  | 'sick'
  | 'flip'
  | 'copy'
  | 'delete'
  | 'spawn_token'
  | 'health'
  | 'counter'
  | 'shuffle'
  | 'mulligan'
  | 'reset'
  | 'untap_all'
  | 'add_card'
  | 'scry'
  | 'surveil'
  | 'mill'
  | 'random_discard'
  | 'pass_turn'
  | 'reveal'
  | 'search'
  | 'token_count'
  | 'roll_die'
  | 'coin_flip'
  | 'message';

export interface ActionLogEntry {
  id: string;          // see generateEntryId() in actionLog.ts — unique across all peers
  actorId: string;     // stable playerId of the player who performed the action
  type: ActionLogType;
  text: string;        // human string, e.g. "played Lightning Bolt"
  ts: number;          // Date.now() at the time of the action
  // Optional CSS color for the message text. Lets a few special events (e.g. a
  // turn pass) stand out from the default white. Generic on purpose so future
  // entry kinds can colorize without a new render branch per type.
  tone?: string;
}
