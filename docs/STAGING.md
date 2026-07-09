# Staging environment

How Aura gets a **staging environment** that accumulates every change bound for
`master`, so we can test and verify a release candidate on a real deployed URL
*before* it reaches production.

Because Aura is peer-to-peer with **no game-state backend** (all shared state is
Yjs CRDTs over WebRTC/WebSockets — see the top-level `CLAUDE.md`), "staging" is
just a second copy of the static bundle at a second URL. There is no database to
branch, no migrations, no data to seed — which is why this is a branch + a
second deploy target, not a new pipeline.

## Branch model

```
feature/* ──PR──▶  staging ──(verify on staging.aura0.app)──▶  master
                   │  Worker: aura0-staging                     │  Worker: aura0
                   │  Sentry/PostHog env: preview               │  env: production
                   └─ integration branch                        └─ release branch
```

- **`staging`** is a long-lived integration branch. Day-to-day PRs target it.
- **`master`** stays the production/release branch. It only ever advances via a
  single `staging → master` promotion PR.
- Each branch is wired to its own **Cloudflare Workers Builds** connection, so a
  push to a branch auto-builds and deploys that branch's Worker. This repo's
  `wrangler.jsonc` differentiates the two targets:
  - production → top-level config → Worker `aura0` (`npx wrangler deploy`)
  - staging → `env.staging` → Worker `aura0-staging` (`npx wrangler deploy --env staging`)

## What already covers staging for free

| Mechanism                              | Covers staging?               | Notes                                                                                                                                                                                                                                                                    |
|----------------------------------------|-------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `test.yml` (vitest + smoke + full-e2e) | ✅ yes, no change              | Runs on `pull_request: ['**']`, so PRs into `staging` and the `staging → master` PR both get full CI. Verified firing on every PR.                                                                                                                                       |
| Sentry / PostHog env split (`main.ts`) | ✅ yes, no change              | `VITE_APP_ENV = staging` → Sentry environment `preview`, so staging errors/metrics don't page production. (Grouped under the generic `preview` label — see "Optional refinements".)                                                                                      |
| `post-deploy-smoke.yml`                | ⚠️ **no — currently dormant** | Triggered `on: deployment_status`, which was a Cloudflare **Pages** behavior. **Workers Builds** reports status via GitHub **check runs + PR comments**, not the Deployments API, so this workflow no longer fires — for staging *or* production. See "Known gap" below. |

## One-time setup

Do these in order. Steps 1–2 are code/git (mostly done in the branch that
introduced this doc); steps 3–5 are Cloudflare + GitHub dashboard actions.

### 1. Land the config on `master`

Merge the PR that adds `env.staging` to `wrangler.jsonc` (and this doc) into
`master`. Production is unaffected — it still deploys from the top-level config.

> One-time note on the bare deploy command: once a named environment exists,
> `npx wrangler deploy` with no `--env` prints a "multiple environments defined"
> warning (it still deploys to `aura0` correctly). To silence it, set the
> production Workers Builds connection's deploy command to
> `npx wrangler deploy --env=""` (explicit top-level).

### 2. Create the `staging` branch

Already done — `staging` was pushed to `origin` from the commit that introduced
`env.staging`, so it carries the config its build needs (without it,
`wrangler deploy --env staging` has no target to resolve). It therefore sits
one commit ahead of `master` until the step-1 PR merges, at which point the two
converge on identical config.

To recreate it from scratch (e.g. after a reset), branch from a commit that has
`env.staging` — simplest is `master` once step 1 has merged:

```bash
git switch master && git pull
git switch -c staging
git push -u origin staging
```

### 3. Cloudflare — create the staging Worker + build connection

Dashboard → **Workers & Pages** → **Create** → **Worker**, or reuse
**Import a repository**. The goal is a *second* Worker named `aura0-staging`
wired to the same GitHub repo, building the `staging` branch.

1. **Connect the repo** (`kenwuuu/aura0`) via the Cloudflare Workers & Pages
   GitHub App (already installed for `aura0`).
2. **Worker name**: `aura0-staging`.
3. **Settings → Build → Branch control**:
   - **Production branch** → `staging` (this is what makes pushes to `staging`
     deploy this Worker).
   - Leave "Builds for non-production branches" **off** unless you also want
     per-PR preview URLs for staging-targeted PRs.
4. **Settings → Build → Deploy command**:
   ```
   npx wrangler deploy --env staging
   ```
   **Build command** (mirror production, mapping the Workers Builds git vars into
   the VITE_ vars `main.ts` reads):
   ```
   VITE_APP_VERSION=$WORKERS_CI_COMMIT_SHA VITE_APP_ENV=$WORKERS_CI_BRANCH npm run build
   ```
   (Cloudflare's env-var *fields* are static strings, not shell expansions, so
   `$WORKERS_CI_*` must appear inside the build command itself — same rule as
   production, see `DEPLOYMENT_SETUP.md`.)

### 4. Cloudflare — staging env vars + custom domain

- **Settings → Variables and Secrets** on `aura0-staging`: add `SENTRY_AUTH_TOKEN`
  (Encrypt) so staging builds still upload sourcemaps. Add any other build vars
  production has (e.g. `CLOUDFLARE_TURN_*`). Staging can point at the same values
  as prod, or its own — this is the seam if you ever want a separate PostHog
  project / TURN key for staging.
- **Custom domain**: `aura0-staging` → **Settings → Domains & Routes** →
  **Add** → **Custom domain** → `staging.aura0.app`. (Because `aura0.app` is a
  zone on the account, this provisions the cert automatically.) You'll also get a
  free `aura0-staging.<subdomain>.workers.dev` if you'd rather not use a subdomain.
  > The custom domain is bound **here**, not in `wrangler.jsonc` — a missing/renamed
  > zone can then never fail the staging build.

### 5. GitHub — retarget PRs and guard `master`

- **Default PR base = `staging`** (done 2026-07-09). GitHub has no separate
  "default PR base" setting — a new PR's base is the repo's **default branch** —
  so `staging` was made the default branch (**Settings → General → Default
  branch**). This does *not* change which branch Cloudflare treats as production
  (that's per-Worker, set in step 3), which is exactly what we want: PRs default
  to `staging`, prod still deploys from `master`.

- **Protecting `master` — the paywall.** GitHub's native **branch protection**
  and **rulesets** are *not available* on a private repo on the Free plan
  (`kenwuuu/aura0` is private + Free — both APIs return HTTP 403). Native,
  server-side protection needs one of: **GitHub Pro** (~$4/mo), or making the
  repo **public** (which would expose git history that contains a compromised
  Cloudflare TURN token — rotate/scrub first; see `DEPLOYMENT_SETUP.md` §4).

- **Free guard we use instead — a local `pre-push` hook** (`.husky/pre-push`):
  blocks accidental `git push` to `master` on any machine that has run
  `npm install` (husky installs it). It is **not** a security control — it can't
  police GitHub-side merges or clones without the hook — it just stops the
  fat-finger `git push origin master`. Override intentionally with
  `ALLOW_MASTER_PUSH=1 git push origin master`. `master` is meant to advance only
  via a merged `staging → master` PR.
  - Full CI still runs regardless: `test.yml` fires on `pull_request: ['**']`, so
    the `staging → master` PR is gated by **test** + **e2e-smoke** (leave
    **e2e-full** advisory — it's `continue-on-error` today). What the paywall
    removes is only the *enforcement* that a PR (and green checks) is required
    before a merge/push — not the checks themselves.
  - If you later upgrade to Pro / go public, add a ruleset on `master`: require a
    PR + require the `test` and `e2e-smoke` status checks. Then the hook becomes
    a belt-and-suspenders local convenience.

## Day-to-day flow

1. Branch off `staging`: `git switch staging && git pull && git switch -c feature/x`.
2. Open a PR **into `staging`**. `test.yml` runs. Merge when green.
3. The merge auto-deploys `aura0-staging` → verify at `staging.aura0.app`.
4. When the release candidate on staging is good, open **one** PR
   `staging → master`. `test.yml` runs again on the combined diff.
5. Merge it → `aura0` deploys to production.

## Promotion & rollback

- **Promote**: the `staging → master` PR *is* the release. Nothing else to do —
  merging it triggers the production Workers Build.
- **Rollback**: Workers keeps prior **versions**. In the Cloudflare dashboard →
  `aura0` → **Deployments** / **Version History**, re-promote the last-known-good
  version to the Active Deployment while a revert PR lands. (This replaces the
  Pages "re-promote a previous deployment" flow referenced in the runbook.)

## Known gap: post-deploy smoke test is dormant

`post-deploy-smoke.yml` runs the `@smoke` Playwright suite against a freshly
deployed URL, but it's triggered `on: deployment_status` — a **Pages** signal.
Under **Workers Builds** that event no longer fires (build status comes through
check runs + PR comments instead), so the workflow has stopped running for
production too. Confirm with `gh run list --workflow=post-deploy-smoke.yml`
(currently empty).

To restore post-deploy smoke coverage for **both** environments, pick one:

- **A GitHub Actions deploy step** (external CI/CD): run `wrangler deploy`
  (prod) / `wrangler deploy --env staging` from a workflow instead of Workers
  Builds, then run `@smoke` against the URL in the same job. Most control; you'd
  turn off the Workers Builds auto-deploy for the branch you move.
- **Poll the deployed URL on a schedule** (`on: schedule`) with the existing
  `PLAYWRIGHT_BASE_URL` smoke job, per environment.
- **Trigger off the Worker's GitHub check-run** completing (`on: check_run`) and
  read the deployed URL from it.

This is out of scope for standing up staging, but worth fixing soon — it's a
silent hole in deploy-break detection today. See `DEPLOYMENT_RUNBOOK.md`.

## Optional refinements (not required)

- **Distinct `staging` label in Sentry/PostHog.** Today `staging` reports as the
  generic `preview` environment (any non-`master` branch does — `main.ts`
  `sentryEnvironment`). If you want staging to stand on its own, add a
  `deployBranch === 'staging' ? 'staging'` arm to that ternary. Left as-is to
  keep this change infra-only.
- **P2P isolation.** Staging and production clients share the same WebRTC
  signaling relay and the `mtg_card_search` card-lookup backend. Room names are
  random, so cross-talk between a staging tester and a prod player is unlikely,
  but not impossible. If you want hard isolation, namespace staging room IDs or
  point staging at separate signaling — otherwise sharing is fine (card lookup is
  read-only).
