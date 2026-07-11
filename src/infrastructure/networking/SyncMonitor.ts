/**
 * SyncMonitor
 *
 * Grace-period state machine for the layer below ConnectionMonitor: signaling
 * can report "connected" while the Yjs doc never actually converges with a
 * peer (webrtc) or the relay (websocket). A caller arms the monitor once the
 * precondition for sync exists (a signaling connection, a peer), and either
 * resolves it via markSynced() or lets the grace timer report a timeout.
 *
 * disarm() cancels an in-flight episode without reporting anything — used
 * when the precondition for sync goes away before sync ever happens (e.g. the
 * one webrtc peer disconnects, or the websocket relay drops). That failure is
 * ConnectionMonitor's to report; this class only speaks to sync itself, so a
 * disarmed episode stays silent rather than double-reporting the same outage.
 */

import * as Sentry from '@sentry/browser';
import { v4 as uuidv4 } from 'uuid';
import { trackSyncOutcome, type TransportLabel } from '@/infrastructure/analytics/PosthogFunctions';

export interface SyncMonitorConfig {
  /** Which transport this watches — tags Sentry + PostHog for breakdown. */
  transport: TransportLabel;
  /** How long unsynced before a stuck sync is worth flagging. */
  graceMs: number;
  /** Sentry message for the failure, e.g. 'WebRTC peer sync timed out'. */
  sentryMessage: string;
  /** Static context (room name…) attached to the Sentry report. */
  context: Record<string, unknown>;
}

export class SyncMonitor {
  private armedSince: number | null = null;
  private errorReported = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  // Correlates the 'timed_out' and 'synced' events a single episode can emit,
  // same reasoning as ConnectionMonitor's episodeId.
  private episodeId: string | null = null;

  constructor(private readonly config: SyncMonitorConfig) {}

  /** Idempotent — a repeat arm() while already waiting on an episode is a no-op. */
  arm(): void {
    if (this.armedSince !== null) return;
    this.armedSince = Date.now();
    this.episodeId = uuidv4();
    this.errorReported = false;
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      this.reportTimedOut();
    }, this.config.graceMs);
  }

  markSynced(peerCount?: number): void {
    if (this.armedSince === null) return; // no in-flight episode to resolve
    const syncMs = Date.now() - this.armedSince;
    const episodeId = this.episodeId;
    this.clearTimer();
    this.armedSince = null;
    this.episodeId = null;
    trackSyncOutcome({
      transport: this.config.transport,
      outcome: 'synced',
      episodeId: episodeId ?? undefined,
      syncMs,
      peerCount,
    });
  }

  disarm(): void {
    this.clearTimer();
    this.armedSince = null;
    this.episodeId = null;
  }

  destroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Fires at most once per armed episode. The episode stays armed afterward —
   * a later markSynced() still reports the full arm-to-sync duration, same as
   * ConnectionMonitor's reportStuck().
   */
  private reportTimedOut(): void {
    if (this.errorReported || this.armedSince === null) return;
    this.errorReported = true;
    const unsyncedForMs = Date.now() - this.armedSince;
    Sentry.captureMessage(this.config.sentryMessage, {
      level: 'error',
      tags: { transport: this.config.transport },
      extra: { ...this.config.context, unsyncedForMs },
    });
    trackSyncOutcome({
      transport: this.config.transport,
      outcome: 'timed_out',
      episodeId: this.episodeId ?? undefined,
      unsyncedForMs,
    });
  }
}
