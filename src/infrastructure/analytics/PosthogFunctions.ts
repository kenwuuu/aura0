import posthog from 'posthog-js';
import {YSTATE_HEALTH} from "@/constants";

// HEALTH

export function trackHealthChange(currentHealth: any): void {
  posthog.capture('health_total_changed', {
    health_total: currentHealth,
  });
}

// CUSTOM COUNTERS

export function trackPlayerCounterChange(counterTitle: string, currentValue: number): void {
  posthog.capture('player_counter_changed', {
    counter_title: counterTitle,
    counter_value: currentValue,
  });
}

export function trackCustomCounterCreated(counterTitle: string, counterIcon: string): void {
  posthog.capture('custom_counter_created', {
    counter_title: counterTitle,
    counter_icon: counterIcon,
  });
}

// NETWORKING

/** Yjs sync transport, used to break down connection outcomes by transport. */
export type TransportLabel = 'websocket' | 'webrtc';

/**
 * Emitted per disconnected episode, for BOTH outcomes, so the failure rate is a
 * real proportion (failed / (connected + failed)) with a denominator — broken
 * down by `transport` to compare WebSocket vs. WebRTC. A single episode can
 * produce up to two events sharing one `episode_id`:
 *   - `failed`    — the connection was still down at the grace mark (~3s).
 *   - `connected` — the connection went (or came back) live.
 *
 * Correlating the two by `episode_id` is what makes the rate honest, because a
 * slow-but-successful connect emits BOTH. Group by `episode_id` to classify:
 *   - `connected` only            → clean connect
 *   - `failed` + `connected`      → recovered (slow, ≥3s, but fine)
 *   - `failed` only               → true hard failure
 * The naive `failed / (connected + failed)` overstates failure because it
 * counts every recovered episode as a whole failure.
 *
 * `episode_type` separates the client's first-ever connect (`initial`) from
 * every reconnect after it (`reconnect`), so initial-connect health and
 * mid-session resilience can be read apart instead of blended.
 *
 * `connect_ms` (success) and `unreachable_for_ms` (failure) are the same clock:
 * time from the episode's disconnected edge to the resolution. The success
 * latency distribution (p50/p95/p99 of `connect_ms`) is the early-warning
 * signal before connects start failing outright. Sentry gets the failure too,
 * for alerting — but a proportion needs the denominator, and high-volume
 * success events belong in analytics, not the error tracker.
 */
/**
 * Emitted per sync episode, mirroring `trackConnectionOutcome`'s episode_id /
 * honest-rate reasoning above — but one level downstream: signaling can be
 * `connected` while state never actually syncs, which only this event can
 * detect. `peerCount` is only meaningful for the webrtc transport (a
 * websocket episode syncs against the relay itself, peers or not).
 */
export function trackSyncOutcome(props: {
  transport: TransportLabel;
  outcome: 'synced' | 'timed_out';
  episodeId?: string;
  syncMs?: number;
  unsyncedForMs?: number;
  peerCount?: number;
}): void {
  posthog.capture('sync_outcome', {
    transport: props.transport,
    outcome: props.outcome,
    ...(props.episodeId !== undefined ? { episode_id: props.episodeId } : {}),
    ...(props.syncMs !== undefined ? { sync_ms: props.syncMs } : {}),
    ...(props.unsyncedForMs !== undefined ? { unsynced_for_ms: props.unsyncedForMs } : {}),
    ...(props.peerCount !== undefined ? { peer_count: props.peerCount } : {}),
  });
}

export function trackConnectionOutcome(props: {
  transport: TransportLabel;
  outcome: 'connected' | 'failed';
  episodeId?: string;
  episodeType?: 'initial' | 'reconnect';
  connectMs?: number;
  unreachableForMs?: number;
}): void {
  posthog.capture('connection_outcome', {
    transport: props.transport,
    outcome: props.outcome,
    ...(props.episodeId !== undefined ? { episode_id: props.episodeId } : {}),
    ...(props.episodeType !== undefined ? { episode_type: props.episodeType } : {}),
    ...(props.connectMs !== undefined ? { connect_ms: props.connectMs } : {}),
    ...(props.unreachableForMs !== undefined
      ? { unreachable_for_ms: props.unreachableForMs }
      : {}),
  });
}

// DECK IMPORTER

export type ImportFailureReason =
  | 'invalid_format'
  | 'parse_error'
  | 'no_valid_entries'
  | 'fetch_catastrophic_failure'
  /**
   * Every card in a well-formed list failed lookup. Previously this landed in
   * `deck_import_partial_failure` with `total_imported: 0` — a "partial" failure
   * that imported nothing, which is a total failure by any reading. It gets its
   * own reason so a backend outage stops hiding inside the partial bucket.
   */
  | 'all_cards_failed';

/**
 * A constructed MTG deck is 60 cards (standard/modern) or 100 (Commander).
 * Any other size means the import produced a deck nobody can legally play, so
 * it is worth flagging even when every card resolved.
 */
const STANDARD_DECK_SIZES = new Set([60, 100]);

export type DeckSizeBucket = '60' | '100' | 'other';

export function bucketDeckSize(cardCount: number): DeckSizeBucket {
  if (cardCount === 60) return '60';
  if (cardCount === 100) return '100';
  return 'other';
}

/**
 * What the deck list asked for vs. what we actually built.
 *
 * These two numbers answer different questions and only mean something together
 * — which is the entire reason this type exists instead of a bare `cardCount`:
 *
 *  - `requestedCardCount` — the deck size the user's list asks for (the sum of
 *    the quantities we parsed). If this isn't 60 or 100, the *input* is off:
 *    either they pasted a partial list, or our parser dropped lines. `raw_text`
 *    is what tells those apart, so we capture it whenever this is non-standard.
 *  - `importedCardCount` — the cards we actually built. If this falls short of
 *    `requestedCardCount`, *our lookup* lost cards; the input was fine.
 *
 * A single `card_count` conflates "they sent bad data" with "our import broke".
 * Splitting them is the only way to tell, from analytics alone, which one it was.
 */
export type ImportCounts = {
  /** Card lines the parser accepted (unique entries, not physical cards). */
  parsedEntryCount: number;
  /** Sum of quantities across those entries — the deck size the list asks for. */
  requestedCardCount: number;
  /** Physical cards actually built into the deck. */
  importedCardCount: number;
  /** Distinct entries that resolved to real card data. */
  uniqueImportedCount: number;
  /** Cards the parser deliberately dropped (sideboard, maybeboard, …). */
  excludedCardCount: number;
};

/**
 * Flatten counts into event properties, deriving the two signals worth alerting
 * on: `cards_missing` (our lookup lost cards) and `is_standard_deck_size` (the
 * list itself was odd).
 */
function countProperties(counts: ImportCounts): Record<string, unknown> {
  return {
    parsed_entry_count: counts.parsedEntryCount,
    requested_card_count: counts.requestedCardCount,
    imported_card_count: counts.importedCardCount,
    unique_imported_count: counts.uniqueImportedCount,
    excluded_card_count: counts.excludedCardCount,
    // > 0 means the lookup dropped cards the list explicitly asked for.
    cards_missing: counts.requestedCardCount - counts.importedCardCount,
    // Describes the *input*: was the list itself a legal deck size?
    requested_size_bucket: bucketDeckSize(counts.requestedCardCount),
    is_standard_deck_size: STANDARD_DECK_SIZES.has(counts.requestedCardCount),
    // Describes the *output*: is what we handed the player a legal deck?
    imported_size_bucket: bucketDeckSize(counts.importedCardCount),
    is_standard_imported_size: STANDARD_DECK_SIZES.has(counts.importedCardCount),
  };
}

/**
 * Max characters of raw deck text captured on a failed import. A real decklist —
 * even a 500-line paste with set codes and collector numbers — sits well under
 * this; the cap only guards against a pathological paste bloating the event.
 */
const MAX_RAW_IMPORT_TEXT_CHARS = 20_000;

/**
 * `rawText` is the exact text the user pasted. We capture it on every anomalous
 * import so real-world cases can be pulled out of PostHog and replayed as parser
 * test fixtures — there is otherwise no way to reconstruct what a user pasted
 * (the metadata-only events told us something went wrong, not what caused it). A
 * decklist is card names, not PII, and the raw string already flows to Sentry on
 * parse / partial failures; this just makes the corpus queryable from analytics.
 */
function rawTextProperties(rawText: string): Record<string, unknown> {
  return {
    raw_text: rawText.slice(0, MAX_RAW_IMPORT_TEXT_CHARS),
    raw_text_truncated: rawText.length > MAX_RAW_IMPORT_TEXT_CHARS,
    text_length: rawText.length,
  };
}

/**
 * The import currently running, if any. A 100-card import takes tens of seconds
 * (p50 ≈ 12s, p95 ≈ 54s), which is more than long enough for a user to close the
 * tab mid-fetch. That used to emit `deck_import_started` with no terminal event,
 * silently breaking the funnel's denominator.
 */
type InFlightImport = {
  startedAt: number;
  textLength: number;
  lineCount: number;
  cardsFetched: number;
  totalCards: number;
};

let inFlightImport: InFlightImport | null = null;
let abandonListenerInstalled = false;

/**
 * `pagehide` is the only unload event that fires reliably on mobile Safari, and
 * `sendBeacon` is the only transport that survives the unload — a normal XHR is
 * cancelled as the page tears down.
 */
function installAbandonListener(): void {
  if (abandonListenerInstalled || typeof window === 'undefined') {
    return;
  }
  abandonListenerInstalled = true;

  window.addEventListener('pagehide', () => {
    const pending = inFlightImport;
    if (!pending) {
      return;
    }
    inFlightImport = null;

    posthog.capture(
      'deck_import_abandoned',
      {
        elapsed_ms: Date.now() - pending.startedAt,
        cards_fetched: pending.cardsFetched,
        total_cards: pending.totalCards,
        progress_ratio:
          pending.totalCards > 0 ? pending.cardsFetched / pending.totalCards : 0,
        text_length: pending.textLength,
        line_count: pending.lineCount,
      },
      { transport: 'sendBeacon' },
    );
  });
}

export function trackImportStarted(text: string): void {
  const lineCount = text.trim().split('\n').filter(line => line.trim().length > 0).length;

  inFlightImport = {
    startedAt: Date.now(),
    textLength: text.length,
    lineCount,
    cardsFetched: 0,
    totalCards: 0,
  };
  installAbandonListener();

  posthog.capture('deck_import_started', {
    text_length: text.length,
    line_count: lineCount,
  });
}

/**
 * Feed lookup progress in so an abandoned import can report how far it got —
 * "they bailed at 3 of 100" and "they bailed at 97 of 100" are different stories.
 */
export function trackImportProgress(current: number, total: number): void {
  if (inFlightImport) {
    inFlightImport.cardsFetched = current;
    inFlightImport.totalCards = total;
  }
}

/**
 * Clear in-flight state so a later page unload isn't misread as an abandoned
 * import. Every terminal tracker below calls this, so no outcome can forget to.
 */
function settleImport(): void {
  inFlightImport = null;
}

export function trackImportFailed(
  reason: ImportFailureReason,
  rawText: string,
  extra: Record<string, unknown> = {},
  counts?: ImportCounts,
): void {
  settleImport();
  posthog.capture('deck_import_failed', {
    reason,
    ...rawTextProperties(rawText),
    ...(counts ? countProperties(counts) : {}),
    ...extra,
  });
}

/**
 * Emitted once per import in which the primary (Aura) backend missed at least one
 * card. Reports the full outcome, not just the trigger: how many the Scryfall
 * fallback then recovered vs. how many no backend could resolve.
 */
export function trackFallbackOutcome(props: {
  triggeredCount: number;
  recoveredCount: number;
  failedCount: number;
  totalCount: number;
}): void {
  posthog.capture('deck_import_fallback_triggered', {
    // Legacy property names, kept so existing insights keep resolving.
    aura_failed_count: props.triggeredCount,
    total_count: props.totalCount,

    fallback_recovered_count: props.recoveredCount,
    fallback_failed_count: props.failedCount,
    // Of the cards Aura missed, what share did Scryfall save? A falling recovery
    // rate means cards are dying, not just being routed around.
    fallback_recovery_rate:
      props.triggeredCount > 0 ? props.recoveredCount / props.triggeredCount : 0,
    // What share of this deck did Aura miss? This is the index-coverage signal.
    aura_miss_rate: props.totalCount > 0 ? props.triggeredCount / props.totalCount : 0,
  });
}

export function trackImportSucceeded(props: {
  counts: ImportCounts;
  durationMs: number;
  rawText: string;
}): void {
  settleImport();

  // Every card resolved, so a non-standard size can only mean the *list* was odd
  // (or we dropped lines parsing it). Keep the raw text for exactly those cases —
  // capturing it on every clean 100-card import would be mostly noise.
  const anomalous = !STANDARD_DECK_SIZES.has(props.counts.importedCardCount);

  posthog.capture('deck_import_succeeded', {
    ...countProperties(props.counts),
    duration_ms: props.durationMs,
    ...(anomalous ? rawTextProperties(props.rawText) : {}),

    // Legacy property names, kept so existing insights keep resolving.
    card_count: props.counts.importedCardCount,
    unique_card_count: props.counts.uniqueImportedCount,
  });
}

/**
 * Some — but not all — cards failed lookup. Note the UI blocks the whole import
 * when any card fails, so from the player's seat this is a failed import, not a
 * degraded one. The raw text is always captured: a partial failure is exactly the
 * case we most want to replay.
 */
export function trackImportPartialFailure(props: {
  counts: ImportCounts;
  failedEntryCount: number;
  durationMs: number;
  rawText: string;
}): void {
  settleImport();

  const { requestedCardCount, importedCardCount } = props.counts;

  posthog.capture('deck_import_partial_failure', {
    ...countProperties(props.counts),
    ...rawTextProperties(props.rawText),
    failed_entry_count: props.failedEntryCount,
    // Share of the requested deck we failed to deliver.
    failure_rate:
      requestedCardCount > 0
        ? (requestedCardCount - importedCardCount) / requestedCardCount
        : 0,
    duration_ms: props.durationMs,

    // Legacy property names, kept so existing insights keep resolving.
    total_requested: props.counts.parsedEntryCount,
    total_imported: importedCardCount,
    total_failed: props.failedEntryCount,
  });
}