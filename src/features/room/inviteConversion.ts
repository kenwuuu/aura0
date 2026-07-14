/**
 * Did the link they copied actually bring somebody in?
 *
 * `room_link_copied` only says a player *tried* to invite someone. Whether the
 * invite landed is the thing worth optimising, and it can be reconstructed after
 * the fact — `room_link_copied` and `game_session_started` both carry `room`, so a
 * different `distinct_id` starting a session in that room afterwards is a real
 * join. Historically that converts at ~48%.
 *
 * But an experiment metric has to attach to *one* user's events, and a cross-user
 * SQL join cannot. So the inviter's own client emits `invite_converted` when a peer
 * turns up in a room they shared — an event attributable to the inviter, and
 * therefore usable as an experiment metric and a funnel step.
 *
 * Caveat, and it matters when reading the numbers: this only fires while the
 * inviter is still *in the room*. Someone who copies a link, closes the tab, and
 * has a friend join an hour later converts in reality — and in the SQL — but emits
 * nothing here. So `invite_converted` is a floor, not the truth. Use it to compare
 * arms (both arms undercount the same way); use the SQL join for the true rate.
 */
import posthog from 'posthog-js';
import type { Awareness } from 'y-protocols/awareness';
import { watchRoomOccupancy } from '@/infrastructure/networking/roomOccupancy';

/** When the local player shared this room's link, if they have. Session-scoped. */
let copiedAt: number | null = null;
let alreadyReported = false;

export function noteRoomLinkCopied(): void {
  if (copiedAt === null) copiedAt = Date.now();
}

/** Test seam — the module-level state above is per-session in the real app. */
export function resetInviteConversionForTests(): void {
  copiedAt = null;
  alreadyReported = false;
}

/**
 * Emits `invite_converted` the first time the room gains a player *after* the
 * local player shared its link. Returns an unsubscribe function.
 */
export function watchInviteConversion(
  awareness: Awareness,
  getRoomName: () => string,
): () => void {
  let lastCount: number | null = null;

  return watchRoomOccupancy(awareness, (playerCount) => {
    const previous = lastCount;
    lastCount = playerCount;

    // Only a genuine arrival counts — `watchRoomOccupancy` reports the current
    // count immediately on subscribe, and a player who reloads can briefly read
    // as a departure and a return.
    if (previous === null || playerCount <= previous) return;
    if (alreadyReported || copiedAt === null) return;

    alreadyReported = true;
    posthog.capture('invite_converted', {
      room: getRoomName(),
      seconds_since_copy: Math.round((Date.now() - copiedAt) / 1000),
      player_count: playerCount,
    });
  });
}
