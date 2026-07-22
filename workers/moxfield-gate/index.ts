/**
 * The Worker that owns the Moxfield rate gate.
 *
 * It exists only to hold a Durable Object class. The gate could technically live
 * in the main `aura0` Worker, but a Durable Object's lifecycle is not the app's
 * lifecycle, and Cloudflare enforces that difference:
 *
 *  - A DO migration cannot ride along in `wrangler versions upload`, which is
 *    exactly how every non-`master` branch of this repo deploys. Keeping the
 *    migration here is what lets branch previews keep working.
 *  - **Rollbacks cannot cross a lifecycle change.** Had this shipped inside
 *    `aura0`, the whole app would have permanently lost the ability to roll back
 *    to any version older than the day Moxfield import landed — a steep price
 *    for one deck source, and this repo leans on rollback (see
 *    docs/deployment/WORKER_CUTOVER_RUNBOOK.md).
 *
 * Cloudflare's own guidance is to deploy Durable Object lifecycle changes
 * independently of other code changes, which is what this file is.
 *
 * Deployed by hand rather than by CI — see docs/deployment/DEPLOYMENT_RUNBOOK.md.
 * It changes about as often as the rate limit does, which is to say never.
 */

export { MoxfieldGate } from '../../src/worker/moxfieldGate';

export default {
  /**
   * This Worker is not meant to be reached over HTTP — `aura0` talks to the
   * Durable Object through a binding, which does not go through this handler.
   * A direct request is therefore always a mistake (a stray route, someone
   * poking the workers.dev URL), and saying so is more useful than a blank 200.
   */
  fetch(): Response {
    return new Response('This Worker only hosts the Moxfield rate gate.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
