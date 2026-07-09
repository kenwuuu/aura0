# Deployment Monitoring Setup

One-time provisioning for the deploy-health wiring in `src/app/main.ts`,
`vite.config.ts`, and `.github/workflows/post-deploy-smoke.yml`. Do this once
per environment (the production Cloudflare Worker `aura0`) — already-set-up
environments don't need to repeat it. For day-to-day incident response once
this is done, see [`DEPLOYMENT_RUNBOOK.md`](./DEPLOYMENT_RUNBOOK.md). For the
staging environment specifically, see [`STAGING.md`](./STAGING.md).

> **Pages → Workers.** We deploy on a **Cloudflare Worker** (`aura0`) built by
> **Workers Builds**, not Cloudflare Pages. The old Pages build vars
> `CF_PAGES_COMMIT_SHA` / `CF_PAGES_BRANCH` are now `WORKERS_CI_COMMIT_SHA` /
> `WORKERS_CI_BRANCH` ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#environment-variables)).

## 1. Cloudflare Workers — build env vars + branch check

Dashboard → **Workers & Pages** → the `aura0` Worker → **Settings → Build**.

- **Build command** — change from `npm run build` to:
  ```
  VITE_APP_VERSION=$WORKERS_CI_COMMIT_SHA VITE_APP_ENV=$WORKERS_CI_BRANCH npm run build
  ```
  Cloudflare's environment-variable fields are static strings, not shell
  expansions — `$WORKERS_CI_COMMIT_SHA` only resolves if it's part of the build
  command itself.
- **Production (deploy) branch** — **Settings → Build → Branch control**;
  confirm it matches `PRODUCTION_BRANCH` in `src/app/main.ts` (currently
  hardcoded to `master`). If yours differs, update that constant.
- **Environment variables** → add `SENTRY_AUTH_TOKEN`, marked **Encrypt**.
  Value is in the local, gitignored `.env.sentry-build-plugin`. Without this,
  `vite.config.ts` skips the Sentry vite plugin entirely — builds still
  succeed, but ship with no sourcemaps and no release.

## 2. Sentry — alert rules, PagerDuty later

sentry.io → org `ken-zw` → project `javascript-react` → **Alerts → Create
Alert**.

- **Issue alerts** (tab "Issues"):
  - "A new issue is created" → environment = `production` → action: email.
  - "Issue changes state from resolved to unresolved" (regression) → same.
- **Metric alert** (tab "Metric"): **Crash Free Session Rate**, threshold
  e.g. below 99% → email. Works out of the box — the browser SDK tracks
  sessions automatically (`autoSessionTracking` defaults on).
- **PagerDuty**, whenever you want it: **Settings → Integrations →
  PagerDuty → Add Installation** (needs an integration key from PagerDuty's
  side), then add a "Send to PagerDuty" action to the rules above — no new
  rules, no code changes.

## 3. PostHog — CI secret, alerts, dashboard

- **Personal API key**: PostHog → avatar → **Personal API Keys → Create**.
  Scope it to **`annotation:write`** only — that's the exact scope the
  `POST /annotations` endpoint requires, nothing broader.
- **Wire it to CI**: GitHub repo → **Settings → Secrets and variables →
  Actions → New repository secret** → name `POSTHOG_PERSONAL_API_KEY`, paste
  the value. `scripts/post-posthog-deploy-annotation.sh` reads it via
  `post-deploy-smoke.yml`; if it's absent the script just skips (never fails
  the deploy over a missing secret).
- **Boot-drop alert**: Insights → New → Trends on `game_session_started`
  (unique count, hourly) → Save → bell icon on the insight → New Alert →
  threshold on % decrease → email.
- **Import-failure alert**: same flow, Trends with formula `A/B`
  (`deck_import_failed` / `deck_import_started`) → alert above ~20%.
- **Dashboard**: Dashboards → New → add the two insights above plus boots/hr.

## 4. Rotate the Cloudflare TURN token

`.env.example` had a real Cloudflare TURN bearer token and key ID committed
in a comment (scrubbed from the working tree, but still present in git
history from commit `7dc7526` onward — treat it as compromised regardless of
the file edit).

- Cloudflare dashboard → **Realtime (Calls) → TURN** → find key ID
  `efd28dcc911...` → revoke it, generate a new Token ID + API Token.
- Put the new values in your local `.env` and in the `aura0` Worker's build
  environment variables (**Settings → Variables and Secrets**:
  `CLOUDFLARE_TURN_TOKEN_ID`, `CLOUDFLARE_TURN_API_TOKEN`). Repeat for
  `aura0-staging` if staging is set up (see [`STAGING.md`](./STAGING.md)).
- Purging the old token from git history itself needs a force-push rewrite
  (`git filter-repo`/BFG) — a separate, more disruptive step; do this
  deliberately, not as a side effect of anything above.

## Verify it worked

- Trigger a test error in a deployed build → confirm it lands in Sentry
  under the right release + environment, unminified.
- Push a deliberately broken commit → confirm `post-deploy-smoke` fails and
  you're notified.
- Deploy normally → confirm a new PostHog annotation appears and fresh
  events carry the new `app_version`.
