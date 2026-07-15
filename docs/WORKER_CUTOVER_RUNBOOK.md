# aura0.app Worker Cutover — Runbook & Handoff

_Last updated 2026-07-08. This is uncommitted on purpose — see the warning below before you `git push`._

## Where things stand
- **`aura0.app` is now served by Worker `aura0`** (migrated off Cloudflare Pages `aura` on 2026-07-08; custom domain + TLS active).
- **Right now it's rolled back to OLD `v39` (`5540f307`)** — the stable pre-Phase-6 build — deliberately, so nothing fresh runs unattended overnight.
- The **rewrite is `v40` (`072ba10e`)**, built by Workers Builds and verified working (correct assets + `app_version` baked in), but **NOT currently live**.
- Deploys run through **Workers Builds** connected to **`kenwuuu/aura0`** (private repo). The build command sets `VITE_APP_VERSION` / `VITE_APP_ENV` from `WORKERS_CI_*`; `SENTRY_AUTH_TOKEN` is a build secret.

## ⚠️ The one thing to know
**Every push to `master` auto-builds and deploys at 100%** (Workers Builds runs `wrangler deploy`) — including docs-only commits. So while we're keeping OLD live: **do not push to `master` unless you intend to put the rewrite live.** To land repo changes without deploying, work on a branch, or temporarily set the Workers Builds *deploy command* to `npx wrangler versions upload` (uploads without going live) and promote manually.

## Runbook (transition period)
| Action | Command |
|---|---|
| Put the **rewrite** live | `npx wrangler versions deploy 072ba10e-607a-4ae2-9cc7-344d98c163c7@100% --name aura0 --yes` |
| **Roll back to OLD** | `npx wrangler rollback 5540f307-8e95-4b82-9999-1d386a1862dd --name aura0` |
| See what's live | `npx wrangler deployments status --name aura0` |
| Verify content | curl `https://aura0.kenqiwu-1b0.workers.dev/` — `aura0.app` itself returns the CF **managed challenge** to non-browser clients (that's a pre-existing zone rule, not a bug) |

After any flip to the rewrite, watch **Sentry** (release = commit SHA) and **PostHog** boot rate (`game_session_started`) for a few minutes. Rollback is instant. Escape hatches, in order: Worker `v39`, the pinned OLD build at `https://0525fc67.aura-dqp.pages.dev`, and Pages `aura` (detached but still alive).

## Handoff — remaining work
- [x] Confirm `post-deploy-smoke.yml` still fires under Workers Builds' `deployment_status` event — **it does NOT** (Workers Builds reports via check runs + PR comments, not the Deployments API; `gh run list --workflow=post-deploy-smoke.yml` is empty). The workflow is dormant for prod. Re-wiring options documented in [`STAGING.md`](./STAGING.md#known-gap-post-deploy-smoke-test-is-dormant).
- [x] Update `docs/DEPLOYMENT_SETUP.md` / `docs/DEPLOYMENT_RUNBOOK.md` — refreshed to the Workers Builds / `WORKERS_CI_*` flow (2026-07-09).
- [ ] Disconnect Git on (or delete) the **stray Pages `aura0` project** — it double-builds `aura0.pages.dev` on every push to `kenwuuu/aura0`.
- [ ] Decide on **CF Web Analytics**: Pages auto-injected its beacon into `index.html`; the Worker does not. Re-add the beacon (token `1dddb2f8…`) if you want to keep it — you also have PostHog + Sentry.
- [ ] **Soak Pages `aura` ~1–2 weeks**, then delete it. Then handle the advanced cert (below).
- [ ] Browser-eyeball `aura0.app`: confirm the rewrite renders and a room loads.
- [ ] **First-run zoom reset:** when a user opens the NEW site for the first time, reset the board zoom level to **1.0x**. Old persisted zoom (from settings / localStorage carried over from the old app) must not leak into the rewrite's react-flow board — detect "first visit to the new site" and normalize zoom to 1.0x.

## What is the "advanced cert"?
The `aura0.app` zone has an active **Advanced Certificate** (Cloudflare **Advanced Certificate Manager** — a paid add-on, ~$10/mo) covering `aura0.app` + `*.aura0.app`, issued by Google (pack `b63461d5-37bb-40fc-986d-06e6aeaad03b`). It's separate from the free **Universal SSL** (also active on the same hostnames). ACM gives control the free cert doesn't (chosen CA, longer validity, explicit hostname sets).

The cutover plan flagged "clean up the old advanced cert," assuming it was a leftover from the Pages custom domain. **Before deleting, note:** it also covers the **wildcard `*.aura0.app`**, which serves live subdomains (`ws.aura0.app`, `staging.aura0.app`). Universal SSL covers those too, so the advanced cert is *probably* redundant now — but first confirm it wasn't set up deliberately and that removing it won't disrupt `ws.*` TLS. If unsure, leave it (it's cheap, not urgent). Delete via **SSL/TLS → Edge Certificates** (pack `b63461d5…`) once Pages is retired and you've confirmed nothing depends on it.
