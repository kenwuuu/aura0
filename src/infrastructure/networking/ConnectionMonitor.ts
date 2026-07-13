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
 *
 * Three different durations come out of a disconnected episode, and conflating
 * them makes all of them useless:
 *   - connect_ms      how long the *successful attempt* took (handshake latency)
 *   - offline_for_ms  how long the user was without a connection (the outage)
 *   - visible_for_ms  how much of the outage the user could actually SEE
 * A transport that reports each attempt via markConnecting() gets a true
 * connect_ms; one that can't (see WebRTCProvider) falls back to timing the whole
 * episode, which is the old, outage-inflated behaviour.
 *
 * `visible_for_ms` is what separates a real incident from a non-event of equal
 * length: a two-minute outage in a backgrounded tab is invisible, while two
 * minutes on a foreground board is a player watching the game die. Both were
 * reported identically until VisibilityTracker (which see — the suspended-laptop
 * case is subtler than it looks) supplied the missing half.
 */

import * as Sentry from '@sentry/browser';
import { v4 as uuidv4 } from 'uuid';
import { trackConnectionOutcome, type TransportLabel } from '@/infrastructure/analytics/PosthogFunctions';
import { VisibilityTracker } from '@/infrastructure/networking/VisibilityTracker';

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
  // Correlates the two events a single disconnected episode can emit — the
  // 'failed' fired at the grace mark and the 'connected' fired if it later
  // recovers — so analytics can tell a hard failure (failed only) from a
  // slow-but-successful connect (failed + connected sharing this id). Minted
  // when an episode begins, cleared when it connects.
  private episodeId: string | null = null;
  // Distinguishes the first connection of this monitor's life from every
  // reconnect after it, so initial-connect health and mid-session resilience
  // can be read separately rather than blended into one rate.
  private hasEverConnected = false;
  // When the attempt that is currently in flight began. Restamped on every
  // retry, so it always refers to the most recent attempt — the one that will
  // succeed, if any. Null until a transport reports an attempt.
  private attemptStartedAt: number | null = null;
  // How much of the current episode the user was actually looking at. Owned here
  // rather than by each transport so every transport reports it for free.
  private readonly visibility = new VisibilityTracker();

  constructor(private readonly config: ConnectionMonitorConfig) {
    // Not connected yet at construction — arm the clock immediately so an
    // initial load that never reaches the server is caught like a later drop.
    this.markDisconnected();
  }

  /**
   * A fresh connection attempt is starting (a new socket is being opened).
   * Optional: transports that can't distinguish "attempting" from "down" simply
   * never call this, and connect_ms degrades to timing the whole episode.
   */
  markConnecting(): void {
    // An attempt only exists inside a disconnected episode. Arming here as well
    // keeps the state machine honest if a transport ever announces an attempt
    // without having announced the drop first — markDisconnected() is a no-op
    // when an episode is already running.
    this.markDisconnected();
    this.attemptStartedAt = Date.now();
  }

  markConnected(): void {
    // Only the disconnected→connected edge counts as one successful connection;
    // repeat "connected" signals (disconnectedSince already null) are ignored so
    // the analytics denominator stays one-per-episode, symmetric with failures.
    if (this.disconnectedSince === null) {
      this.attemptStartedAt = null;
      return;
    }
    const now = Date.now();
    // Time the attempt that actually succeeded, not the outage that preceded it.
    // This is the whole point: a laptop that slept for three days with the socket
    // down wakes, retries, and connects in ~300ms. Timing from the disconnected
    // edge would call that a three-day "connect latency" — it was three days of
    // absence plus a fast handshake, and only offlineForMs should say so.
    // Transports with no attempt signal fall back to the episode clock.
    const connectMs = now - (this.attemptStartedAt ?? this.disconnectedSince);
    const offlineForMs = now - this.disconnectedSince;
    const visibleForMs = this.visibility.stop();
    const episodeId = this.episodeId;
    // Read the type before flipping the flag: a slow initial connect is still
    // an 'initial' outcome even though this call is what makes future connects
    // count as reconnects.
    const episodeType = this.hasEverConnected ? 'reconnect' : 'initial';
    this.disconnectedSince = null;
    this.attemptStartedAt = null;
    this.episodeId = null;
    this.errorReported = false;
    this.hasEverConnected = true;
    this.clearTimer();
    trackConnectionOutcome({
      transport: this.config.transport,
      outcome: 'connected',
      episodeId: episodeId ?? undefined,
      episodeType,
      connectMs,
      offlineForMs,
      visibleForMs,
    });
  }

  markDisconnected(): void {
    if (this.disconnectedSince !== null) return; // already counting down
    this.disconnectedSince = Date.now();
    // Any attempt from the previous episode is void; wait for a fresh one rather
    // than let a stale stamp inflate the next connect_ms.
    this.attemptStartedAt = null;
    this.episodeId = uuidv4();
    this.visibility.start();
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
    this.visibility.destroy();
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
    // Same episode also feeds the PostHog failure/total proportion. It carries
    // the episode id so a later recovery ('connected' with the same id) can be
    // distinguished from a connection that truly never came back.
    trackConnectionOutcome({
      transport: this.config.transport,
      outcome: 'failed',
      episodeId: this.episodeId ?? undefined,
      episodeType: this.hasEverConnected ? 'reconnect' : 'initial',
      unreachableForMs,
      // read(), not stop(): the episode is still live and may yet recover, so
      // this is a snapshot at the grace mark rather than a final total. The
      // 'connected' event that ends the episode carries the full figure.
      visibleForMs: this.visibility.read(),
    });
  }
}
