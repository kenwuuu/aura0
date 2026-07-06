# Deployment Health Runbook

How we know when a deployment breaks, and how to trace an error back to the
commit that caused it. Covers the wiring added in `src/app/main.ts`,
`vite.config.ts`, `playwright.config.ts`, and
`.github/workflows/post-deploy-smoke.yml`.

## The pieces

| Layer                               | Where                                     | Detects                                         |
|-------------------------------------|-------------------------------------------|-------------------------------------------------|
| Sentry (errors, releases, alerts)   | `main.ts` `Sentry.init`                   | Thrown exceptions, crash-free session rate      |
| PostHog (`app_version`, dashboards) | `main.ts` `posthog.register`              | Boot-rate drops, product-metric shifts          |
| Post-deploy smoke test              | `.github/workflows/post-deploy-smoke.yml` | Broken build/boot, before any real user hits it |

Sentry owns *errors*. PostHog owns *product signals*.

## Where `VITE_APP_VERSION` comes from

Cloudflare Pages sets `CF_PAGES_COMMIT_SHA` for every build. The Pages
project's build config is set to also export that as `VITE_APP_VERSION`, and
`CF_PAGES_BRANCH` as `VITE_APP_ENV` — Vite auto-exposes anything prefixed
`VITE_` to the client bundle, no code change needed to pick up a new value.

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

## "A deploy just broke something" — first response

1. **Check the post-deploy-smoke GitHub Action** for the deploy (Actions tab,
   `Post-deploy smoke test` workflow). Red = the shell doesn't boot / a known
   flow is broken, confirmed within seconds of the deploy, independent of
   real traffic.
2. **Check Sentry** for a new issue on the release matching the deploy's
   commit SHA, or a crash-free-rate drop.
3. **Check the PostHog dashboard** for a boot-rate (`game_session_started`)
   drop — this is the one that catches a **silent white-screen deploy that
   throws nothing** (blank page, no exception, no console error).
4. If confirmed bad: revert/roll back the commit. Cloudflare Pages keeps
   prior deploys — you can also just re-promote the last-known-good
   deployment from the Cloudflare dashboard while the revert PR lands.

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
  `environment` — update this if the Cloudflare Pages production branch ever
  changes.
- Cloudflare Pages build env must actually set `VITE_APP_VERSION`,
  `VITE_APP_ENV`, and `SENTRY_AUTH_TOKEN` — without them, builds still work,
  but ship with no release, no environment split, and no sourcemaps.
- Deploy annotations need a `POSTHOG_PERSONAL_API_KEY` GitHub Actions secret;
  without it, the annotation step silently no-ops (by design — it never
  fails the deploy over a missing secret).
