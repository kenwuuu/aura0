# Issuing a foil cosmetic code

Fulfillment for the foil cosmetic is manual by design. Ko-fi mails you a
purchase, you mail back a code, the code goes in a list in the Worker, and the
Worker redeploys. This is the runbook for the middle two steps.

Everything here is production. `staging.aura0.app` has its own Worker with its
own copy of the list, so a code added to `staging` does nothing for a buyer.

## The 60-second version

```bash
git switch master && git pull
git switch -c codes/2026-09-17

# add 'FOIL-XXXXX' to ISSUED_CODES in src/worker/foilCodes.ts
npx vitest run src/worker/foilCodes.test.ts

git commit -am "Issue foil code for <order ref>"
gh pr create --base master --title "Issue foil code" --fill
gh pr merge --merge          # a merge commit, never a squash — see below
git switch staging && git merge master && git push
```

Then watch the production build finish, and only then mail the buyer.

## Why this goes to `master`, not `staging`

The normal flow for this repo is branch off `staging`, PR into `staging`, and
promote later (`docs/deployment/STAGING.md`). **Issuing a code does not follow
it**, for a reason worth being explicit about:

`staging` accumulates unreleased work. If a code has to ride a
`staging → master` promotion, then mailing one buyer their code means shipping
whatever else happens to be sitting on `staging` that day — and if that work
isn't ready, the buyer waits on it. That couples a customer's purchase to an
unrelated release, which is exactly the coupling the hotfix path exists to
break. `CLAUDE.md` calls a `master` hotfix "a human call — not a default"; a
paid customer waiting on a code is that call.

The change itself is one string added to a list, covered by tests, server-side
only, touching nothing else. Shipping it straight to production is a smaller
risk than the alternative.

**The back-merge is not optional.** After merging to `master`, merge
`master → staging` immediately. Skip it and `staging` no longer contains the
code, so the next promotion silently reverts it and the buyer's code stops
working.

**Merge commit, never squash.** Squashing a `master`-bound PR re-freezes the
merge-base and makes every subsequent promotion conflict (this bit us on
#152 → #169). Feature → staging stays squash; anything involving `master` is a
real merge.

## Step by step

### 1. Read the Ko-fi notification

You need the order reference and the buyer's email. Keep the order ref for the
commit message — it is the only link between a code and the purchase that paid
for it, since nothing in the app records who holds which code.

### 2. Generate a code

Format is `FOIL-` plus five uppercase base32-ish characters, e.g. `FOIL-7X2QF`.
Nothing enforces that shape; it is a convention so codes are recognizable in a
support email and readable over a phone.

```bash
echo "FOIL-$(LC_ALL=C tr -dc 'A-HJ-NP-Z2-9' </dev/urandom | head -c5)"
```

That alphabet deliberately omits `I`, `O`, `0` and `1` — a buyer retyping a code
from an email should not have to guess which one they are looking at.

### 3. Add it to the list

`src/worker/foilCodes.ts`:

```ts
const ISSUED_CODES: readonly string[] = [
  'FOIL-7X2QF',   // 2026-09-17 ko-fi #1234
];
```

Case and surrounding whitespace do not matter — the list is normalized on the
way in, the same as the incoming code. A comment with the date and order ref is
worth the two seconds; it is the only audit trail there is.

### 4. Verify before you ship

```bash
npx vitest run src/worker/foilCodes.test.ts
```

This does **not** test your specific code — the test suite uses its own fixture
list, so the real one can stay empty in CI. What it catches is a malformed edit
to the file. If you want to prove the exact string works, run the dev server and
redeem it against the local endpoint (the Vite plugin serves the same handler
Cloudflare runs, which is why it exists):

```bash
npm run dev
curl -s localhost:5173/api/foil-codes/redeem \
  -H 'content-type: application/json' \
  -d '{"code":"FOIL-7X2QF"}'
# {"valid":true,"style":"nebula"}
```

### 5. Ship it

Open the PR against `master` and merge it as a merge commit. There is no branch
protection on this repo (private, free plan), so the merge is available
immediately — but `test.yml` runs `e2e-full` as a blocking job on
`master`-targeting PRs, and that suite takes around nine minutes. For a one-line
code addition, waiting for unit tests and letting `e2e-full` finish afterwards is
a reasonable call; use your judgement, and do not mail the buyer until the
deploy is actually live.

### 6. Confirm the deploy, then mail the buyer

Merging `master` triggers the production Workers Build (`npm run build` +
`npx wrangler deploy`). Watch it in the Cloudflare dashboard under
**Workers & Pages → aura0 → Deployments**; the repo's post-deploy smoke workflow
is dormant under Workers Builds, so nothing will tell you automatically.

Confirm against production before sending anything:

```bash
curl -s https://aura0.app/api/foil-codes/redeem \
  -H 'content-type: application/json' \
  -d '{"code":"FOIL-7X2QF"}'
```

`{"valid":true,"style":"nebula"}` means the buyer's code will work. Anything
else — `{"valid":false}`, HTML, a 404 — means the deploy has not landed yet.
**Mail the code only after you have seen that response.** A code that arrives
before the deploy reads to the buyer as a broken purchase, which is the single
most likely way this flow loses someone's trust.

### 7. Back-merge

```bash
git switch staging && git pull && git merge master && git push
```

## Rolling one back

There is no revocation. Removing a code from `ISSUED_CODES` and redeploying
stops it being *redeemable*, but anyone who already redeemed it keeps the
cosmetic — the unlock lives in their browser's `aura:cosmetics`, and the app
never re-checks. Treat issuing a code as irreversible for anyone who has already
used it.

## Known sharp edges

- **Staging has its own list.** A code added on `staging` does nothing for a
  real buyer, and vice versa.
- **The unlock is per-browser.** A buyer who switches device or clears site data
  needs to redeem the same code again — it keeps working, so re-sending it is a
  valid support answer.
- **Codes are shareable.** Nothing binds a code to a person, and anyone can edit
  their own `localStorage` to grant themselves the cosmetic. This was an accepted
  trade at this scale. What is *not* leaked is the list itself: it lives only in
  the Worker, never in the browser bundle, which is the entire reason the check
  is server-side. A test asserts the response never names it.
- **Guessing is unthrottled.** There is no rate limit on the endpoint. Five
  characters of a 30-ish character alphabet is slow enough to ignore while the
  list is small; revisit if it is not.

## If this gets tedious

The redeploy exists only because the list is a constant in the bundle. Two ways
out, neither built:

- **`wrangler secret put FOIL_CODES`** — read the list from `env` instead of a
  module constant. Adding a code becomes one command and takes effect in
  seconds, with no build, no PR and no back-merge.
- **A KV namespace** — same idea, plus you could write codes from a script or
  revoke them.

Both are small changes to `foilCodes.ts`. Worth doing at roughly the point where
issuing codes stops being rare enough to enjoy.
