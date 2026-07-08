/**
 * ConnectionMonitor
 *
 * Transport-agnostic grace-period state machine shared by every Yjs transport.
 * A fresh monitor starts life disconnected, so an initial page load that never
 * connects is treated exactly like a mid-session drop. When the connection
 * stays down past the grace period it reports the failure to Sentry once per
 * stuck episode; on every episode it also feeds PostHog an outcome
 * (connected / failed) so the failure rate has a denominator rather than just
 * an absolute count. It runs independently of any UI status listener.
 *
 * The transports differ only in what "connected" means and where that signal
 * comes from (a single y-websocket socket vs. any of y-webrtc's signaling
 * sockets), so they own the wiring and call markConnected()/markDisconnected();
 * this class owns the timing, dedup, and reporting.
 */

import * as Sentry from '@sentry/browser';
import { trackConnectionOutcome, type TransportLabel } from '@/infrastructure/analytics/PosthogFunctions';

export interface ConnectionMonitorConfig {
  /** Which transport this watches — tags Sentry + PostHog for breakdown. */
  transport: TransportLabel;
  /** How long unreachable before a stuck connection is worth flagging. */
  graceMs: number;
  /** Sentry message for the failure, e.g. 'WebSocket relay unreachable'. */
  sentryMessage: string;
  /** Static context (server URL, room name…) attached to the Sentry report. */
  context: Record<string, unknown>;
}

export class ConnectionMonitor {
  private disconnectedSince: number | null = null;
  private errorReported = false;
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: ConnectionMonitorConfig) {
    // Not connected yet at construction — arm the clock immediately so an
    // initial load that never reaches the server is caught like a later drop.
    this.markDisconnected();
  }

  markConnected(): void {
    // Only the disconnected→connected edge counts as one successful connection;
    // repeat "connected" signals (disconnectedSince already null) are ignored so
    // the analytics denominator stays one-per-episode, symmetric with failures.
    // connectMs measures that edge: construction→connect on first load, or
    // drop→reconnect thereafter — i.e. how long the user waited to be online.
    const connectMs = this.disconnectedSince === null
      ? undefined
      : Date.now() - this.disconnectedSince;
    this.disconnectedSince = null;
    this.errorReported = false;
    this.clearTimer();
    if (connectMs !== undefined) {
      trackConnectionOutcome({ transport: this.config.transport, outcome: 'connected', connectMs });
    }
  }

  markDisconnected(): void {
    if (this.disconnectedSince !== null) return; // already counting down
    this.disconnectedSince = Date.now();
    this.stuckTimer = setTimeout(() => {
      this.stuckTimer = null;
      this.reportStuck();
    }, this.config.graceMs);
  }

  /**
   * True once we've been unreachable past the grace period. Lets the UI decide
   * whether to keep saying "connecting" or surface a real error.
   */
  isStuck(): boolean {
    return this.disconnectedSince !== null
      && Date.now() - this.disconnectedSince > this.config.graceMs;
  }

  destroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.stuckTimer !== null) {
      clearTimeout(this.stuckTimer);
      this.stuckTimer = null;
    }
  }

  /**
   * Fires at most once per stuck episode (reset on the next successful
   * connect), so a flaky connection reports each distinct outage rather than
   * spamming Sentry on every retry.
   */
  private reportStuck(): void {
    if (this.errorReported || this.disconnectedSince === null) return;
    this.errorReported = true;
    const unreachableForMs = Date.now() - this.disconnectedSince;
    Sentry.captureMessage(this.config.sentryMessage, {
      level: 'error',
      tags: { transport: this.config.transport },
      extra: { ...this.config.context, unreachableForMs },
    });
    // Same episode also feeds the PostHog failure/total proportion.
    trackConnectionOutcome({ transport: this.config.transport, outcome: 'failed', unreachableForMs });
  }
}
