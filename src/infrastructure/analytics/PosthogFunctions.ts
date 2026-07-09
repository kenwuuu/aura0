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
 * One event per connection episode, for BOTH outcomes, so the failure rate is a
 * simple breakdown by `outcome` (failed / (connected + failed)) — and by
 * `transport`, to compare WebSocket vs. WebRTC. Sentry gets the failure too, for
 * alerting — but a proportion needs the denominator, and high-volume success
 * events belong in analytics, not the error tracker.
 *
 * `connect_ms` (success) and `unreachable_for_ms` (failure) are the same clock:
 * time from the episode's disconnected edge to the resolution. The success
 * latency distribution is the early-warning signal before connects start
 * failing outright.
 */
export function trackConnectionOutcome(props: {
  transport: TransportLabel;
  outcome: 'connected' | 'failed';
  connectMs?: number;
  unreachableForMs?: number;
}): void {
  posthog.capture('connection_outcome', {
    transport: props.transport,
    outcome: props.outcome,
    ...(props.connectMs !== undefined ? { connect_ms: props.connectMs } : {}),
    ...(props.unreachableForMs !== undefined
      ? { unreachable_for_ms: props.unreachableForMs }
      : {}),
  });
}

// DECK IMPORTER

export type ImportFailureReason =
  | 'invalid_format'
  | 'section_headers_detected'
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