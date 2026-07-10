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
  | 'fetch_catastrophic_failure';

export function trackImportStarted(text: string): void {
  const lineCount = text.trim().split('\n').filter(line => line.trim().length > 0).length;

  posthog.capture('deck_import_started', {
    text_length: text.length,
    line_count: lineCount,
  });
}

export function trackImportFailed(
  reason: ImportFailureReason,
  extra: Record<string, unknown> = {}
): void {
  posthog.capture('deck_import_failed', {
    reason,
    ...extra,
  });
}

export function trackFallbackTriggered(auraFailedCount: number, totalCount: number): void {
  posthog.capture('deck_import_fallback_triggered', {
    aura_failed_count: auraFailedCount,
    total_count: totalCount,
  });
}

export function trackImportSucceeded(props: {
  cardCount: number;
  uniqueCardCount: number;
  durationMs: number;
}): void {
  posthog.capture('deck_import_succeeded', {
    card_count: props.cardCount,
    unique_card_count: props.uniqueCardCount,
    duration_ms: props.durationMs,
  });
}

export function trackImportPartialFailure(props: {
  totalRequested: number;
  totalImported: number;
  totalFailed: number;
  durationMs: number;
}): void {
  posthog.capture('deck_import_partial_failure', {
    total_requested: props.totalRequested,
    total_imported: props.totalImported,
    total_failed: props.totalFailed,
    failure_rate: props.totalRequested > 0 ? props.totalFailed / props.totalRequested : 0,
    duration_ms: props.durationMs,
  });
}