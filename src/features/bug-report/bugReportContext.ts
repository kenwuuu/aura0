/**
 * The game-state snapshot a bug report is filed against.
 *
 * "It didn't sync" is not a reproducible report. Every sync incident this
 * project has had — the ad-blocked players silently landing on WebRTC alone,
 * the importer drawing a whole deck into the opening hand — needed to know
 * which room, which transport, and how many peers were present before it could
 * be reproduced at all. Collecting that at report time is the difference
 * between a ticket and a shrug.
 *
 * Every field is best-effort and nothing here may throw. The store is empty
 * until `bootstrapGame()` finishes, and a report filed from a half-booted app
 * is precisely the report worth keeping — so a missing instance yields `null`
 * rather than an exception that would swallow the report entirely.
 *
 * Transport is deliberately absent: `bootstrap.ts` tags the Sentry scope with
 * it once at startup, so it rides along on this event and on every error,
 * instead of being re-derived here.
 */
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import { useGameInstance } from '@/app/stores/gameInstanceStore';

/**
 * Where the report was filed from. Sentry indexes this as a tag, so "every
 * report from the pile viewer" is a search rather than a scroll, and PostHog
 * can break report volume down by surface.
 */
export const BUG_REPORT_SURFACES = ['toolbar', 'help', 'deck-import', 'pile-viewer'] as const;

export type BugReportSurface = (typeof BUG_REPORT_SURFACES)[number];

/**
 * Flat and primitive-valued on purpose: this maps directly onto Sentry tags,
 * which are indexed scalars. Nesting anything here would silently stringify.
 */
export interface BugReportContext {
  surface: BugReportSurface;
  room: string | null;
  peer_count: number | null;
  hand_count: number | null;
  deck_count: number | null;
  discard_count: number | null;
  exile_count: number | null;
  board_card_count: number | null;
  board_token_count: number | null;
}

export function collectBugReportContext(surface: BugReportSurface): BugReportContext {
  const context: BugReportContext = {
    surface,
    room: null,
    peer_count: null,
    hand_count: null,
    deck_count: null,
    discard_count: null,
    exile_count: null,
    board_card_count: null,
    board_token_count: null,
  };

  try {
    const { yDoc, player, roomManager, awareness } = useGameInstance.getState();

    if (roomManager) {
      context.room = roomManager.getRoomName();
    }

    // Awareness counts every connected client including this one, which is the
    // number a player would actually report ("there were three of us").
    if (awareness) {
      context.peer_count = awareness.getStates().size;
    }

    if (player) {
      const state = player.getState();
      context.hand_count = state.hand.length;
      context.deck_count = state.deck.length;
      context.discard_count = state.discardPile.length;
      context.exile_count = state.exilePile.length;
    }

    if (yDoc) {
      context.board_card_count = yDoc.getMap(YDOC_CARDS_ON_BOARD).size;
      context.board_token_count = yDoc.getMap(YDOC_KEYWORD_TOKENS).size;
    }
  } catch {
    // Deliberately swallowed. A snapshot that fails must never cost the user
    // their report — a report with `null` counts still carries the replay,
    // the breadcrumbs, and what the player typed.
  }

  return context;
}
