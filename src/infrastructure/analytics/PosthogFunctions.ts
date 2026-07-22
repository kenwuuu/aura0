import posthog from 'posthog-js';
import {YSTATE_HEALTH} from "@/constants";
import type { DeckLineItem } from '@/features/deck-manager/DeckListParser';
import type { LookupFailure, LookupFailureReason } from '@/infrastructure/cards/CardApiClient';

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
 * Emitted whenever the number of players actually in the room changes (see
 * `watchRoomOccupancy` in `roomOccupancy.ts`) — not on every awareness update.
 * Answers "how many players are in a room at a time": breaking down by
 * `$session_id` and taking the max (or just plotting the distribution of
 * `player_count` values) gives room-size distribution without needing
 * duration-weighting.
 */
export function trackRoomOccupancyChanged(playerCount: number): void {
  posthog.capture('room_occupancy_changed', {
    player_count: playerCount,
  });
}

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
 *
 * `visible_for_ms` is how much of the outage the user could see. Read against
 * `offline_for_ms`: near 0 means nobody was looking (backgrounded, or a slept
 * laptop), near 1 means somebody sat and watched the board freeze. Don't try to
 * reconstruct it from `visibilityState` — see VisibilityTracker for why that
 * scores a slept laptop as rapt attention.
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

/**
 * Reports a pass of the room-doc collector (see networking/roomDocStorage.ts).
 *
 * `storageUsageBytes` is the whole origin's usage, not just room docs — it's the number that
 * tells us whether the leak is actually draining in the field, and how big it had grown before
 * anything collected it. `adopted` is only non-zero on a client's first pass after the collector
 * ships, so a persistently high `adopted` would mean rooms are being created without registering.
 */
export function trackRoomDocsPurged(props: {
  purged: number;
  adopted: number;
  tracked: number;
  storageUsageBytes?: number;
}): void {
  posthog.capture('room_docs_purged', {
    purged_count: props.purged,
    adopted_count: props.adopted,
    tracked_count: props.tracked,
    ...(props.storageUsageBytes !== undefined ? { storage_usage_bytes: props.storageUsageBytes } : {}),
  });
}

/**
 * `connectMs` times the successful connection attempt (handshake latency);
 * `offlineForMs` times the outage it ended. They are not interchangeable — a
 * client that slept through a three-day outage and then reconnected instantly
 * has a tiny connectMs and a huge offlineForMs. Chart latency off the former.
 */
export function trackConnectionOutcome(props: {
  transport: TransportLabel;
  outcome: 'connected' | 'failed';
  episodeId?: string;
  episodeType?: 'initial' | 'reconnect';
  connectMs?: number;
  offlineForMs?: number;
  unreachableForMs?: number;
  visibleForMs?: number;
}): void {
  posthog.capture('connection_outcome', {
    transport: props.transport,
    outcome: props.outcome,
    ...(props.episodeId !== undefined ? { episode_id: props.episodeId } : {}),
    ...(props.episodeType !== undefined ? { episode_type: props.episodeType } : {}),
    ...(props.connectMs !== undefined ? { connect_ms: props.connectMs } : {}),
    ...(props.offlineForMs !== undefined ? { offline_for_ms: props.offlineForMs } : {}),
    ...(props.unreachableForMs !== undefined
      ? { unreachable_for_ms: props.unreachableForMs }
      : {}),
    ...(props.visibleForMs !== undefined ? { visible_for_ms: props.visibleForMs } : {}),
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
  /** Which sections those dropped cards came from, e.g. `["sideboard"]`. */
  excludedSections: string[];
  /**
   * Header labels the parser didn't recognize and imported as main deck anyway.
   * When a deck comes out over-sized, this is the first place to look — a custom
   * category we waved through that was really a sideboard.
   */
  unrecognizedSections: string[];
  /**
   * Cards tagged for the command zone. `Player` draws every one of them into the
   * opening hand, so this is the size of that hand — and the only number that
   * can see a command zone that swallowed the deck.
   */
  commanderCardCount: number;
};

/**
 * The most cards a command zone can legally hold: partners, or a commander and
 * its background. Anything above this is not a deck-building choice, it is a
 * parser fault.
 */
const MAX_LEGAL_COMMANDERS = 2;

/**
 * Flatten counts into event properties, deriving the signals worth alerting on:
 * `cards_missing` (our lookup lost cards), `is_standard_deck_size` (the list
 * itself was odd), and `command_zone_overflowed` (see below).
 */
function countProperties(counts: ImportCounts): Record<string, unknown> {
  return {
    parsed_entry_count: counts.parsedEntryCount,
    requested_card_count: counts.requestedCardCount,
    imported_card_count: counts.importedCardCount,
    unique_imported_count: counts.uniqueImportedCount,
    excluded_card_count: counts.excludedCardCount,
    excluded_sections: counts.excludedSections,
    unrecognized_sections: counts.unrecognizedSections,
    // > 0 means the lookup dropped cards the list explicitly asked for.
    cards_missing: counts.requestedCardCount - counts.importedCardCount,
    // Describes the *input*: was the list itself a legal deck size?
    requested_size_bucket: bucketDeckSize(counts.requestedCardCount),
    is_standard_deck_size: STANDARD_DECK_SIZES.has(counts.requestedCardCount),
    // Describes the *output*: is what we handed the player a legal deck?
    imported_size_bucket: bucketDeckSize(counts.importedCardCount),
    is_standard_imported_size: STANDARD_DECK_SIZES.has(counts.importedCardCount),

    // Every commander-tagged card is drawn into the opening hand, so this is
    // that hand's size. It is reported on *every* import, not just the broken
    // ones, because the failure it exists to catch is invisible to all the
    // numbers above: a parser that tags the whole deck as commanders still
    // yields a perfectly standard 100-card import. That is exactly what
    // happened — 8.9% of imports dealt the player their entire library, and
    // 44 of every 45 sailed past the deck-size checks with a legal size.
    commander_card_count: counts.commanderCardCount,

    // A deck cannot have three commanders. If this is ever true, the command
    // zone has stopped meaning anything and the player is about to be handed
    // their deck — alert on it rather than waiting for someone to notice.
    command_zone_overflowed: counts.commanderCardCount > MAX_LEGAL_COMMANDERS,
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

/** Bounds event size. A deck is ~100 cards; a longer list adds no diagnostic value. */
const MAX_REPORTED_CARD_NAMES = 30;

/**
 * Emitted once per import in which the primary (Aura) backend missed at least one
 * card. Reports the full outcome, not just the trigger: how many the Scryfall
 * fallback then recovered vs. how many no backend could resolve.
 *
 * The failure *reason* breakdown is the point. A 404 means Aura answered and the
 * card genuinely isn't indexed; anything else means Aura never answered at all.
 * Those are opposite problems with opposite fixes, and reporting them as one
 * number ("aura_miss_rate") is how a Cloudflare edge block spent a month being
 * read as a card-index coverage gap.
 */
export function trackFallbackOutcome(props: {
  triggeredCount: number;
  recoveredCount: number;
  failedCount: number;
  totalCount: number;
  auraFailures: LookupFailure[];
  deadItems: DeckLineItem[];
}): void {
  const byReason = (reason: LookupFailureReason) =>
    props.auraFailures.filter((f) => f.reason === reason);

  const notFound = byReason('not_found');
  const infraFailed = props.auraFailures.filter((f) => f.reason !== 'not_found');

  posthog.capture('deck_import_fallback_triggered', {
    // Legacy property names, kept so existing insights keep resolving.
    aura_failed_count: props.triggeredCount,
    total_count: props.totalCount,
    aura_miss_rate: props.totalCount > 0 ? props.triggeredCount / props.totalCount : 0,

    fallback_recovered_count: props.recoveredCount,
    fallback_failed_count: props.failedCount,
    // Of the cards Aura missed, what share did Scryfall save? A falling recovery
    // rate means cards are dying, not just being routed around.
    fallback_recovery_rate:
      props.triggeredCount > 0 ? props.recoveredCount / props.triggeredCount : 0,

    // --- Why Aura failed. `aura_miss_rate` above conflates all of these. ---
    aura_failed_not_found: notFound.length,
    aura_failed_rate_limited: byReason('rate_limited').length,
    aura_failed_blocked: byReason('blocked').length,
    aura_failed_server_error: byReason('server_error').length,
    aura_failed_network_or_blocked: byReason('network_or_blocked').length,
    aura_failed_timeout: byReason('timeout').length,
    aura_failed_unknown: byReason('unknown').length,
    aura_dominant_failure_reason: mostCommonReason(props.auraFailures),

    // The honest split of the old `aura_miss_rate`. Index misses are a data
    // problem (reindex); infra failures are an availability problem (page someone).
    aura_index_miss_rate: props.totalCount > 0 ? notFound.length / props.totalCount : 0,
    aura_infra_failure_rate:
      props.totalCount > 0 ? infraFailed.length / props.totalCount : 0,

    // Names of cards Aura answered "not found" for — the actual index-coverage
    // gap, and the list to go fix. Deliberately excludes infra failures: when the
    // backend is unreachable, the "missing" cards are just whatever happened to be
    // in the deck (Sol Ring, basic lands), which is noise, not signal.
    aura_not_found_cards: notFound
      .slice(0, MAX_REPORTED_CARD_NAMES)
      .map((f) => f.item.name),
    // Cards no backend could resolve. These are the ones the user actually loses.
    dead_cards: props.deadItems
      .slice(0, MAX_REPORTED_CARD_NAMES)
      .map((item) => item.name),
  });
}

function mostCommonReason(failures: LookupFailure[]): LookupFailureReason | undefined {
  const counts = new Map<LookupFailureReason, number>();
  for (const f of failures) counts.set(f.reason, (counts.get(f.reason) ?? 0) + 1);

  let best: LookupFailureReason | undefined;
  let bestCount = 0;
  for (const [reason, count] of counts) {
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  return best;
}

/**
 * A deck link was resolved through `/api/deck-import`.
 *
 * This fires once per upstream request — including failures, because a failed
 * request costs the same rate budget a successful one does — and it exists to
 * answer one question we deliberately did not guess at: **how often is the same
 * deck fetched twice?**
 *
 * Moxfield caps Aura at one request per second across all players, and caching
 * is the obvious way to stretch that. But a cache TTL trades staleness for
 * headroom, and we have no idea yet whether the repeat rate justifies the trade
 * — a pod all opening one shared link would, a hundred players each importing
 * their own deck would not. So Moxfield runs uncached on purpose and this event
 * measures the real repeat rate first. See `cacheHintFor` in
 * `src/worker/deckImport.ts`.
 *
 * `deck_id` is the site's own public identifier — the same string that appears
 * in a shareable URL — so it identifies a deck, never a player. It is what makes
 * the repeat rate computable at all: group by `source` + `deck_id` and compare
 * total events to distinct decks.
 */
export function trackDeckUrlImport(props: {
  source: string;
  deckId: string;
  outcome: 'succeeded' | 'failed';
  durationMs: number;
}): void {
  posthog.capture('deck_url_import', {
    source: props.source,
    deck_id: props.deckId,
    outcome: props.outcome,
    duration_ms: props.durationMs,
  });
}

export function trackImportSucceeded(props: {
  counts: ImportCounts;
  durationMs: number;
  rawText: string;
}): void {
  settleImport();

  posthog.capture('deck_import_succeeded', {
    ...countProperties(props.counts),
    duration_ms: props.durationMs,

    // Captured on *every* success, not just the odd-sized ones. Anomalies alone
    // would tell us what breaks but never what "working" looks like — and a
    // clean 100-card Moxfield export is precisely the regression baseline any
    // parser has to keep passing. It is also where the format diversity lives:
    // ~83% of imports are ordinary decks, and skipping them would mean owning a
    // corpus made entirely of weird lists.
    //
    // The cost argument for skipping them doesn't hold: PostHog bills per event,
    // not per byte, and this rides on an event that already fires. A 100-card
    // list is ~3KB, so a busy day is ~1MB.
    ...rawTextProperties(props.rawText),

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

// ONBOARDING TOUR

/**
 * Every tour event carries `variant` (the `onboarding-tour-step-order` arm) and
 * `layout`, because the tour's whole reason for existing is an A/B on step order
 * and the copy differs by input modality. A funnel that can't split on those two
 * can't answer the question the tour was built to ask.
 */
type TourEventContext = {
  /** Which tour. See the note on TourId — this cannot be added retroactively. */
  tourId: string;
  variant: string;
  layout: 'phone' | 'desktop';
  stepId: string;
  stepIndex: number;
};

function tourProperties(ctx: TourEventContext): Record<string, unknown> {
  return {
    tour_id: ctx.tourId,
    variant: ctx.variant,
    layout: ctx.layout,
    step_id: ctx.stepId,
    step_index: ctx.stepIndex,
  };
}

/**
 * Stamp the player's onboarding outcome onto *every* event from here on, as a
 * PostHog super property.
 *
 * This is what answers the question the tour exists to justify — do onboarded
 * players stick around? — because it lets any insight (retention, session count,
 * deck imports) break down by whether the player finished the tour, skipped it,
 * or never saw it (`null`).
 *
 * Deliberately a super property and not a *person* property: person properties
 * require a person profile, which requires `identify()`, which makes every event
 * an identified event — about 5x the price ($0.000248 vs $0.00005) for a profile
 * keyed to the same device-scoped id we already have, since Aura has no login.
 * Super properties are free, work for anonymous users, and are all we need.
 */
const TOUR_OUTCOME_PROPERTY = 'onboarding_tour_outcome';

export function registerTourOutcome(outcome: string | null): void {
  // `register({ x: null })` is a no-op — it does NOT clear a previously
  // registered value. So a player who finished the tour and then replayed it
  // would keep carrying `completed` on every event, describing a tour they are
  // in the middle of redoing. Clearing needs `unregister`.
  //
  // Absence is meaningful, and is the right shape: a player who never saw the
  // tour has no value here, which reads as "is not set" in PostHog.
  if (outcome === null) {
    posthog.unregister(TOUR_OUTCOME_PROPERTY);
    return;
  }

  posthog.register({ [TOUR_OUTCOME_PROPERTY]: outcome });
}

/**
 * The tour a player is currently in, if any. Same reasoning as `inFlightImport`
 * above: a first-run tour that a user walks away from mid-step would otherwise
 * emit `tour_started` with no terminal event, and the funnel's denominator would
 * quietly stop meaning anything. Most first-time visitors arrive from Instagram
 * and a good number of them will close the tab — abandonment is the *expected*
 * outcome here, not an edge case, so it has to be counted.
 */
type InFlightTour = {
  startedAt: number;
  tourId: string;
  variant: string;
  layout: 'phone' | 'desktop';
  stepId: string;
  stepIndex: number;
  stepsCompleted: number;
};

let inFlightTour: InFlightTour | null = null;
let tourAbandonListenerInstalled = false;

function installTourAbandonListener(): void {
  if (tourAbandonListenerInstalled || typeof window === 'undefined') {
    return;
  }
  tourAbandonListenerInstalled = true;

  // `pagehide` + `sendBeacon` for the same reason as the deck-import listener:
  // it is the only pair that survives an unload on mobile Safari, which is most
  // of this audience.
  window.addEventListener('pagehide', () => {
    const pending = inFlightTour;
    if (!pending) {
      return;
    }
    inFlightTour = null;

    posthog.capture(
      'tour_abandoned',
      {
        ...tourProperties(pending),
        elapsed_ms: Date.now() - pending.startedAt,
        steps_completed: pending.stepsCompleted,
      },
      { transport: 'sendBeacon' },
    );
  });
}

export function trackTourStarted(ctx: TourEventContext): void {
  inFlightTour = {
    startedAt: Date.now(),
    tourId: ctx.tourId,
    variant: ctx.variant,
    layout: ctx.layout,
    stepId: ctx.stepId,
    stepIndex: ctx.stepIndex,
    stepsCompleted: 0,
  };
  installTourAbandonListener();

  posthog.capture('tour_started', tourProperties(ctx));
}

/** Fired when a step becomes the active one — the funnel's per-step denominator. */
export function trackTourStepViewed(ctx: TourEventContext): void {
  if (inFlightTour) {
    inFlightTour.stepId = ctx.stepId;
    inFlightTour.stepIndex = ctx.stepIndex;
  }

  posthog.capture('tour_step_viewed', tourProperties(ctx));
}

/**
 * Fired when the player actually performs the step's action (or presses the
 * button on an informational step). `dwell_ms` is how long the step took, which
 * is the signal that tells you whether a step is confusing or merely last.
 */
export function trackTourStepCompleted(ctx: TourEventContext & { dwellMs: number }): void {
  if (inFlightTour) {
    inFlightTour.stepsCompleted += 1;
  }

  posthog.capture('tour_step_completed', {
    ...tourProperties(ctx),
    dwell_ms: ctx.dwellMs,
  });
}

export function trackTourCompleted(ctx: Omit<TourEventContext, 'stepId' | 'stepIndex'> & { stepCount: number }): void {
  const elapsedMs = inFlightTour ? Date.now() - inFlightTour.startedAt : 0;
  inFlightTour = null;

  posthog.capture('tour_completed', {
    tour_id: ctx.tourId,
    variant: ctx.variant,
    layout: ctx.layout,
    step_count: ctx.stepCount,
    elapsed_ms: elapsedMs,
  });
}

/** Terminal, like `tour_completed` — the two together close the funnel. */
export function trackTourSkipped(ctx: TourEventContext): void {
  const pending = inFlightTour;
  inFlightTour = null;

  posthog.capture('tour_skipped', {
    ...tourProperties(ctx),
    elapsed_ms: pending ? Date.now() - pending.startedAt : 0,
    steps_completed: pending?.stepsCompleted ?? 0,
  });
}