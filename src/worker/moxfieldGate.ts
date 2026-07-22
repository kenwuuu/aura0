/**
 * The global rate gate for Moxfield requests.
 *
 * Moxfield issued Aura a single approved User-Agent and caps it at one request
 * per second. That cap applies to *Aura*, not to a player or a colo — and a
 * Worker has no shared state between colos, so nothing running inside `fetch()`
 * can enforce it. A Durable Object can: every Moxfield request in the world is
 * routed to one instance (`idFromName(GATE_NAME)`), which is the only way to
 * make "one per second" mean one per second rather than one per second per
 * edge location.
 *
 * The stakes are not throttling but access. Exceeding the cap risks the
 * User-Agent being revoked, which removes the feature for everyone — so this
 * errs toward spending less than the budget rather than more.
 *
 * ── Why this hands back a delay instead of sleeping ─────────────────────────
 * A Durable Object handles requests on a single thread. If it slept until a slot
 * came free, a queue of waiters would block the very object every other request
 * has to reach, and the whole system would serialize on it. Instead it *reserves*
 * the next slot — advancing the clock immediately, so the slot cannot be handed
 * out twice — and returns how long the caller should wait before using it. The
 * waiting happens out in the Worker, where it costs nothing that other requests
 * need.
 *
 * A caller that reserves a slot and then dies wastes it. That is the acceptable
 * direction of error: an unused slot stays under the cap, a double-used one does
 * not.
 */

/** Moxfield's cap: one request per second for the approved User-Agent. */
const MIN_INTERVAL_MS = 1000;

/**
 * How long a request may wait for a slot before we give up and tell the player.
 *
 * Bounded on purpose. Deck documents are ~1.4MB and the upstream fetch already
 * carries its own 10s timeout, so an unbounded queue would grow past the point
 * where waiting could still succeed and every queued player would wait only to
 * fail. Three seconds is enough to absorb a pod importing different decks at
 * once — the realistic contention — and short enough to stay honest.
 */
const MAX_QUEUE_MS = 3000;

/** All Moxfield traffic must reach the same instance for the cap to mean anything. */
export const GATE_NAME = 'global';

export type SlotReservation =
  | { granted: true; waitMs: number }
  | { granted: false; retryAfterMs: number };

export class MoxfieldGate {
  /**
   * When the next request may be sent, as an epoch millisecond.
   *
   * Deliberately in memory rather than in Durable Object storage. Storage would
   * mean a write on every request to protect against an eviction that can only
   * happen after the object has been idle — and an idle gate is exactly the case
   * where the budget has already refilled and losing the value costs nothing.
   * Reading a stale zero after an eviction permits one immediate request, which
   * is correct, not a burst.
   */
  private nextAvailableAt = 0;

  async fetch(): Promise<Response> {
    const now = Date.now();
    const slotAt = Math.max(now, this.nextAvailableAt);
    const waitMs = slotAt - now;

    if (waitMs > MAX_QUEUE_MS) {
      // Not reserved — the clock does not advance, so declining costs no budget.
      return Response.json({ granted: false, retryAfterMs: waitMs } satisfies SlotReservation);
    }

    // Reserve before replying. The caller has not sent anything yet, but the slot
    // is spent from this moment, which is what stops two concurrent callers from
    // being handed the same one.
    this.nextAvailableAt = slotAt + MIN_INTERVAL_MS;

    return Response.json({ granted: true, waitMs } satisfies SlotReservation);
  }
}

/**
 * An in-process stand-in for the gate, used by the Vite dev server.
 *
 * Dev runs one Node process, so the same arithmetic in a module-level closure is
 * exactly as correct there as the Durable Object is in production. It exists so
 * that developing against a real Moxfield credential still honours the real cap
 * — the credential is the same one production uses, and Moxfield cannot tell the
 * two apart.
 */
export function createLocalGate(): { reserve(): SlotReservation } {
  let nextAvailableAt = 0;

  return {
    reserve() {
      const now = Date.now();
      const slotAt = Math.max(now, nextAvailableAt);
      const waitMs = slotAt - now;

      if (waitMs > MAX_QUEUE_MS) {
        return { granted: false, retryAfterMs: waitMs };
      }

      nextAvailableAt = slotAt + MIN_INTERVAL_MS;
      return { granted: true, waitMs };
    },
  };
}
