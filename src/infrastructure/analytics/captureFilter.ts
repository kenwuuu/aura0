import type { CaptureResult } from 'posthog-js';

/**
 * Events dropped client-side, before anything is sent to PostHog.
 *
 * `$autocapture` was 37% of our entire billed ingestion and is read by exactly
 * zero of our 96 saved insights. It is also mostly a worse duplicate of
 * instrumentation we already have on purpose: the `+`/`−` counter buttons alone
 * were ~168k events/month, and `health_total_changed` already covers them.
 */
const DROPPED_EVENTS = new Set(['$autocapture']);

/**
 * `before_send` hook: return `null` to drop an event so it is never queued,
 * never sent, and never billed.
 *
 * Why this rather than `autocapture: false` — which is the obvious way to turn
 * autocapture off, and is wrong here:
 *
 * `$rageclick` is not an independent capture path. posthog-js detects it inside
 * the autocapture click handler, behind that handler's own enablement check
 * (`get isEnabled() { return !!this.instance.config.autocapture && !r }`), and
 * only then re-enters to emit `$rageclick`. Setting `autocapture: false`
 * therefore silently takes `$rageclick` with it — and `$rageclick` *is* read, by
 * two insights and the whole User Research dashboard.
 *
 * So we leave the handler enabled (it still runs rageclick detection) and drop
 * only the `$autocapture` payloads on their way out. Verified against
 * posthog-js 1.390.2; if a future upgrade decouples rageclick from autocapture,
 * this can collapse to `autocapture: false`.
 */
export function dropUnusedEvents(result: CaptureResult | null): CaptureResult | null {
  if (result && DROPPED_EVENTS.has(result.event)) return null;
  return result;
}
