# Issuing a foil cosmetic code

Fulfillment for the foil cosmetic is manual by design: Ko-fi mails you a
purchase, you mail back a code. This is the runbook for the middle step.

**Nothing is deployed to issue a code.** A code is valid because its last three
characters agree with its first five under a salted hash, and the function that
checks that shipped with the app — so a code minted thirty seconds ago works in
a browser that loaded last week. There is no list of issued codes, in the
bundle, in a Worker, or anywhere else. There is nothing to add a code *to*.

This file used to live under `docs/deployment/`. It moved because there is no
longer a deployment involved.

## The whole thing

```bash
node scripts/foil-code.mjs      # FOIL-7X2QF-K4M
```

Mail that to the buyer. Done.

```bash
node scripts/foil-code.mjs 5    # five at once, e.g. to keep a few on hand
```

## Step by step

### 1. Read the Ko-fi notification

You need the buyer's email, and the order reference if you want a record. Keep
your own note of which code went with which order — nothing in the app records
it, and there is no list to look it up in later.

### 2. Mint and send

```bash
node scripts/foil-code.mjs
```

Codes look like `FOIL-7X2QF-K4M`: five body characters, three check characters.
The alphabet deliberately omits `I`, `O`, `0` and `1`, so a buyer retyping from
an email never has to guess which one they are looking at.

Redemption is forgiving about how the code arrives — case is ignored and all
whitespace is stripped, so a wrapped line or a sloppy paste still works. The
dashes are required.

### 3. There is no step 3

No PR, no merge, no back-merge, no build to watch, no `curl` against production
to confirm the code went live before you press send. The code is live the moment
you mint it.

If you want to see it work anyway, paste it into **Settings ▸ Cosmetics** on
`localhost:5173`, `staging.aura0.app` or `aura0.app` — all three run the same
check, because the check is in the page.

## What this is not

It is not a security boundary, and swapping the old Worker endpoint for this did
not make it one. Anyone who opens devtools can read `isValidFoilCode` and mint
their own codes — but they could already grant themselves the cosmetic with one
line in a console, because the unlock lives in their own `localStorage` and is
never re-checked. The endpoint guarded a door next to an open window, and
charged a production deploy per sale for it.

What a code actually buys, honestly:

- a purchase produces *a thing*, which is most of why codes exist at all;
- a typo is told apart from a code that was never ours;
- support can trust the format;
- nothing you publish reveals how many copies have sold, which a bundled list of
  issued codes would have.

## Sharp edges

- **The unlock is per-browser.** A buyer who switches device or clears site data
  needs to redeem the same code again — it keeps working, so re-sending it is a
  valid support answer.
- **Codes are shareable, and there is no revocation.** Nothing binds a code to a
  person, and once redeemed the unlock is durable in that browser whatever you
  do afterwards. Treat issuing a code as irreversible.
- **Guessing is cheap.** Three check characters is 1 in 32,768, and the check
  runs locally, so anyone determined can find a valid code in milliseconds. This
  is fine for the same reason the rest of it is fine — see above. Do not build
  anything on top of a code that you would not build on top of a URL.

## Rotating the scheme

If the generator leaks somewhere public and free foils become a nuisance, bump
`SALT` in `src/features/cosmetics/foilCode.ts` from `aura-foil-v1` to
`aura-foil-v2` and ship it.

That invalidates **every code ever minted**, including ones sitting unredeemed
in buyers' inboxes, so you have to re-mail anyone who has not redeemed yet.
Anyone who already redeemed keeps their cosmetic — the unlock is durable and
this code never runs for them again.

Two things will fail loudly the moment you change the salt, which is deliberate:

- `src/features/cosmetics/foilCode.test.ts` pins a real code
- `tests/e2e/harness/cosmetics.ts` pins the same one for the e2e specs

Mint a fresh code, update both, and let the failures be the reminder that
inboxes just went stale.

## If a buyer says their code does not work

In order of likelihood:

1. **They typed `I` for `J`, or `0` for `O`.** Those characters are not in the
   alphabet, so the code is rejected before the check digits are even computed.
   Re-send the code and suggest copy-paste.
2. **They are on a different browser or profile** than the one they redeemed in.
   The unlock is per-browser. Re-sending the same code fixes it.
3. **The salt was rotated** since you mailed them. Mint a new one.

There is no fourth cause. Nothing about redemption can be down, slow, or
rate-limited, because nothing about it leaves their machine.
