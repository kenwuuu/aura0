# Deployment Health Runbook

How we know when a deployment breaks, and how to trace an error back to the
commit that caused it. Covers the wiring added in `src/app/main.ts`,
`vite.config.ts`, `playwright.config.ts`,
`.github/workflows/post-deploy-smoke.yml`, and
`.github/workflows/synthetic-canary.yml`.

## The pieces

| Layer                               | Where                                     | Detects                                         |
|-------------------------------------|-------------------------------------------|-------------------------------------------------|
| Sentry (errors, releases, alerts)   | `main.ts` `Sentry.init`                   | Thrown exceptions, crash-free session rate      |
| PostHog (`app_version`, dashboards) | `main.ts` `posthog.register`              | Boot-rate drops, product-metric shifts, connection/sync/backend health — see [Reading the health metrics](#reading-the-health-metrics) |
| Post-deploy smoke test              | `.github/workflows/post-deploy-smoke.yml` | Broken build/boot, before any real user hits it — ⚠️ **dormant, see below** |
| Synthetic canary (production)       | `.github/workflows/synthetic-canary.yml`  | The P2P path itself — two real browsers join a room and one must see the other's card sync over real WebRTC, every 30 min. Runs on a clock, not on deploys — it answers "is P2P healthy right now," not "did this deploy break something." PostHog-silent (harness blocks analytics). |

Sentry owns *errors*. PostHog owns *product signals*. The synthetic canary
owns *"does the core P2P loop actually still work,"* independent of both —
everything else above can look green while peering or sync is silently broken.

> ⚠️ **Post-deploy smoke is currently dormant.** That workflow triggers
> `on: deployment_status`, which was a Cloudflare **Pages** signal. We now
> deploy via **Workers Builds**, which reports status through GitHub check
> runs + PR comments, *not* the Deployments API — so the workflow no longer
> fires (confirm: `gh run list --workflow=post-deploy-smoke.yml` is empty).
> Until it's re-wired, Sentry + PostHog (below) are the live layers. Fix
> options are in [`STAGING.md`](./STAGING.md#known-gap-post-deploy-smoke-test-is-dormant).

## Worker secrets

One secret is required per Worker, and it is **not** in `wrangler.jsonc` —
anything in `vars` is plaintext in the repo and in the dashboard.

| Secret                 | Used by                    | Consequence if missing                          |
|------------------------|----------------------------|-------------------------------------------------|
| `MOXFIELD_USER_AGENT`  | `/api/deck-import`         | Moxfield imports return **503**; other sources unaffected |

Secrets are per-Worker and are **not** inherited into named environments, so
production and staging each need their own:

```bash
npx wrangler secret put MOXFIELD_USER_AGENT                  # aura0 (production)
npx wrangler secret put MOXFIELD_USER_AGENT --env staging    # aura0-staging
```

Locally, put it in `.dev.vars` (gitignored) as `MOXFIELD_USER_AGENT=<value>` —
both `wrangler dev` and the Vite dev server read that file. Note the leading
dot: a file named `dev.vars` is ignored by git but *not* read by wrangler.

This is a credential Moxfield issued to Aura specifically, and it is capped at
one request per second **for all of Aura**, not per player. That cap is enforced
by a Durable Object (`src/worker/moxfieldGate.ts`) — if it is ever bypassed, the
risk is not throttling but the credential being revoked for everyone. See the
["deck sites" gotcha](#known-gotchas).

## Where `VITE_APP_VERSION` comes from

Cloudflare **Workers Builds** injects `WORKERS_CI_COMMIT_SHA` for every build.
The `aura0` Worker's build command exports that as `VITE_APP_VERSION`, and
`WORKERS_CI_BRANCH` as `VITE_APP_ENV` — Vite auto-exposes anything prefixed
`VITE_` to the client bundle, no code change needed to pick up a new value.
(Older setups used the Pages names `CF_PAGES_COMMIT_SHA` / `CF_PAGES_BRANCH`.)

That one string ends up in two places:
- `Sentry.init({ release: ... })` in `main.ts`
- `posthog.register({ app_version: ... })` in `main.ts`

Same commit SHA, both tools — that's the join key.

## Tracing a Sentry error back to a commit

1. Open the issue in Sentry → note the **Release** on the right sidebar. That
   *is* the commit SHA (`VITE_APP_VERSION`).
2. `git show <sha>` (or `git log -1 <sha>`) locally, or open
   `https://github.com/<org>/aura/commit/<sha>` — that's the exact deploy.
3. Stack trace lines are unminified (sourcemaps upload during build via
   `@sentry/vite-plugin`, gated on `SENTRY_AUTH_TOKEN` in `vite.config.ts`) —
   click through directly to source.
4. Check **Environment** (top of the issue) — `production` vs `preview`.
   Preview-branch deploys report `preview` and shouldn't page anyone.

## Tracing a PostHog metric back to a deploy

1. On the deployment-health dashboard, find the point where the metric moved.
2. Every deploy posts a **PostHog annotation** (via
   `scripts/post-posthog-deploy-annotation.sh`, called from the post-deploy
   workflow) — annotations render as vertical markers on the chart. Line the
   shift up with the nearest marker.
3. To confirm, breakdown any trend by the `app_version` event property —
   this is the same commit SHA as the Sentry release.

## Reading the health metrics

**[Site Health & Uptime](https://us.posthog.com/project/476486/dashboard/1831980)**
is the one dashboard for reliability/uptime — connection success/failure,
latency, error rates, backend availability. Add new reliability signals there,
not a new dashboard. (Everyday product metrics — boot rate, deck import error
rate, invite rate — live on *Analytics basics (wizard)*; cross-referenced
below, not duplicated.)

Three tiles use the same **honest-rate method**: group `connection_outcome`
episodes by `episode_id`, then rate = episodes with `failed` and **no**
matching `connected` ÷ total `initial`-type episodes. This is not
`failed / (failed + connected)` — that naive form overstates failure because
it counts a slow-but-recovered connect (`failed` + `connected` sharing an
`episode_id`) as a whole failure. Both hard-failure tiles gate on `>= 20`
loads/hour so a quiet hour doesn't read as 100% or 0% off a handful of events.

| Tile | Meaning | Baseline (30d, as of 2026-07-11) |
|---|---|---|
| WS initial-connect hard-failure rate (hourly) | honest rate, websocket transport | ~0–3%; hit 28%/54% during the 07-10 OOM window |
| WebRTC signaling hard-failure rate (hourly) | same method, webrtc transport | near-empty — websocket is the dominant transport today; kept live so it's already correct once that shifts |
| Connection outcomes (daily) | raw connected vs. failed counts by outcome | context for the two rates above, not itself a rate |
| Scryfall fallback rate & intensity | rate = fallback-triggered imports ÷ (imports − pre-lookup failures); intensity = Σ aura-missed cards ÷ Σ total cards per fallback | rate ~15–44%, intensity ~2–20% — fallback is routine, not rare; watch for *both* climbing together, that's the Aura backend degrading, not normal digital-only-card misses |
| `hand_clobbered` rate (hourly) | count of actual CRDT state-corruption events — not a proxy | 0 for weeks; a real spike means player state is getting overwritten, usually alongside a connectivity incident |
| Reconnect churn (reconnects per session, daily) | `connection_outcome{episode_type=reconnect, outcome=connected}` ÷ daily sessions | ~0; a climb means sessions are dropping and reconnecting repeatedly, not simply single failures |
| Connect latency p95 (daily, by transport) | p95 `connect_ms` on successful connects | early-warning — latency degrades before connects start failing outright |

**Reading a live incident**: these three — `hand_clobbered` rate, reconnect
churn, and fallback intensity — tend to move **together** during a real
connectivity incident (state gets clobbered *because* connections are
flapping, which also drives reconnect churn; backend calls degrade under the
same load, which drives fallback intensity). One metric alone can be noise;
two or three climbing at once is a strong signal, even before any alert fires.

**Alert quota**: PostHog caps this project at 5 insight alerts, currently all
in use (WS hard-failure, WebRTC hard-failure, Scryfall fallback rate,
`hand_clobbered`, Deck import error rate). The boot-drop alert described in
[`DEPLOYMENT_SETUP.md`](./DEPLOYMENT_SETUP.md#3-posthog--ci-secret-alerts-dashboard)
is deliberately not wired because of this — see that doc before adding a 6th.

**Known stale insight**: "Successful WebSocket Connections" (on *Analytics
basics (wizard)*) still queries the old `ws_connection_outcome` event name,
renamed to `connection_outcome` in PR #22 — it's been silently dead since.
Worth deleting or repointing; not touched by this work.

## Synthetic canary

`.github/workflows/synthetic-canary.yml` runs the `@canary`-tagged Playwright
test(s) against `https://aura0.app` every 30 minutes (`workflow_dispatch` for
an on-demand run). Today that's just
`tests/e2e/smoke/two_player_sync.spec.ts` — two real browser contexts join a
fresh random room and one must see the other's card sync over real WebRTC. It
reuses the same harness (`tests/e2e/harness/`) as every other e2e test, just
pointed at production instead of a local dev server via `PLAYWRIGHT_BASE_URL`.

- **Green**: the P2P path (signaling → peering → sync) works end-to-end right
  now. Independent of whether anyone is actually online.
- **Red**: check the uploaded Playwright report artifact
  (`playwright-report-synthetic-canary`) on the failed run first — same report
  format as any other e2e failure. Cross-reference
  [Site Health & Uptime](https://us.posthog.com/project/476486/dashboard/1831980)
  for the same window: a canary failure alongside a WS/WebRTC hard-failure or
  sync-timeout spike confirms a real outage, not e2e flakiness.
- **PostHog-silent by design** — the harness's `blockAnalytics` aborts all
  PostHog requests for every client it creates, so canary runs never inflate
  real connection/session counts. This means the canary can't be found *in*
  PostHog; it's a separate signal, not a PostHog event.
- To add a `staging.aura0.app` tier or a new `@canary` scenario, see
  [`STAGING.md`](./STAGING.md#known-gap-post-deploy-smoke-test-is-dormant).

## "A deploy just broke something" — first response

1. **Check Sentry** for a new issue on the release matching the deploy's
   commit SHA, or a crash-free-rate drop. (This is step 1 today because the
   post-deploy-smoke Action is dormant — see the ⚠️ note above. Once it's
   re-wired, check it first: red = the shell doesn't boot / a known flow is
   broken, confirmed within seconds, independent of real traffic.)
2. **Check the PostHog dashboards** — *Analytics basics (wizard)* for a
   boot-rate (`game_session_started`) drop, which catches a **silent
   white-screen deploy that throws nothing** (blank page, no exception, no
   console error); [Site Health & Uptime](https://us.posthog.com/project/476486/dashboard/1831980)
   for a connection/sync/backend regression the deploy introduced. See
   [Reading the health metrics](#reading-the-health-metrics) for what each
   tile means.
3. If confirmed bad: revert/roll back the commit. **Workers keeps prior
   versions** — in the Cloudflare dashboard → `aura0` → **Deployments** /
   **Version History**, re-promote the last-known-good version to the Active
   Deployment while the revert PR lands.

## Alerts today, and adding more later

Alerts currently land as **email** — Sentry alert rules (new issue,
regression, crash-free-rate drop, spike) and the post-deploy smoke job
(GitHub's own failure-notification email, since we're watching it in the
Actions tab / Sentry alerting rather than a webhook right now).

To add **PagerDuty** later: it's a native Sentry integration — turn it on in
Sentry's integration settings, point the existing alert rules at it. No code
or alert-rule rewrites needed. For the smoke-test workflow, add one step at
the bottom of `post-deploy-smoke.yml` (a webhook POST) — that's the single
notification seam, marked with a comment in the file.

## Known gotchas

The following all originates from 
[`DEPLOYMENT_SETUP.md`](./DEPLOYMENT_SETUP.md). If we change any of the 
following, make sure to update [`DEPLOYMENT_SETUP.md`](./DEPLOYMENT_SETUP.md):

- `main.ts` hardcodes `PRODUCTION_BRANCH = 'master'` to decide Sentry
  `environment` — update this if the Worker's production (deploy) branch ever
  changes. A non-master deploy branch (e.g. `staging`) reports as `preview`.
- The `aura0` Worker's build command must actually set `VITE_APP_VERSION`,
  `VITE_APP_ENV`, and `SENTRY_AUTH_TOKEN` — without them, builds still work,
  but ship with no release, no environment split, and no sourcemaps.
- Deploy annotations need a `POSTHOG_PERSONAL_API_KEY` GitHub Actions secret;
  without it, the annotation step silently no-ops (by design — it never
  fails the deploy over a missing secret).
