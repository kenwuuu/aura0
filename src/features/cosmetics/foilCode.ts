/**
 * Foil license codes — minted offline, verified here in the browser.
 *
 * A code is valid because its last three characters agree with its first five,
 * under a salted hash. There is no list of issued codes, here or anywhere: this
 * file is the whole check, and it shipped once. Issuing a code is
 * `node scripts/foil-code.mjs` and an email — no deploy, no redeploy, nothing
 * for a buyer to wait on. See `docs/FOIL_CODES.md`.
 *
 * ── This is not a security boundary, and was never going to be ──────────────
 * Anyone who opens devtools can read this function and mint their own codes.
 * That is not a regression from checking codes on a server, because the unlock
 * has always lived in the player's own `localStorage` and is never re-checked —
 * one line in a console grants the cosmetic without going near any code at all.
 * A server check guarded a door next to an open window, and cost a network
 * round trip, a dev-server shim of the same endpoint, and a production deploy
 * per sale to do it.
 *
 * So what this actually buys is honest and small:
 *   - a purchase produces *a thing*, which is most of why a code exists at all;
 *   - a typo is told apart from a wrong code;
 *   - a code that was never ours is rejected, so support can trust the format;
 *   - nothing published to a buyer reveals how many have been sold, which a
 *     bundled list of issued codes would have.
 *
 * ── If the scheme leaks ────────────────────────────────────────────────────
 * Bump {@link SALT} to `aura-foil-v2` and ship it. Every previously minted code
 * stops validating, and buyers are re-mailed a fresh one. That is a blunt
 * instrument and it logs nobody out — an already-redeemed unlock is durable in
 * that browser and this code never runs again for them — but it does stop a
 * leaked generator cold, which a list of issued codes could not.
 */

/**
 * Base32 minus `I`, `O`, `0` and `1` — the four characters someone retyping a
 * code from an email would have to guess between.
 *
 * Mirrored in `scripts/foil-code.mjs`; `foilCode.test.ts` fails if they drift.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Salts the check digits so the scheme is not simply "some hash of the body".
 *
 * Versioned on purpose — see the rotation note above. Changing it invalidates
 * every code ever minted, which is a thing to do deliberately and never by
 * accident, so the e2e specs pin a real code and fail loudly if it moves.
 */
const SALT = 'aura-foil-v1';

/** `FOIL-` + five body characters + `-` + three check characters. */
const CODE_SHAPE = new RegExp(`^FOIL-([${ALPHABET}]{5})-([${ALPHABET}]{3})$`);

/**
 * Three check characters derived from the body — FNV-1a, salted.
 *
 * Three rather than two because two (1 in 1,024) is close enough to guessable
 * that someone mashing the keyboard could stumble into a valid code and file a
 * confused support ticket. Three is 1 in 32,768, which clears that bar while
 * keeping the code short enough to read down a phone. It is emphatically not a
 * brute-force defence — nothing here is, see the note above.
 */
function checkDigits(body: string): string {
  let hash = 0x811c9dc5;
  const input = SALT + body;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (
    ALPHABET[(hash >>> 10) & 31] + ALPHABET[(hash >>> 5) & 31] + ALPHABET[hash & 31]
  );
}

/**
 * Whether this is a code we minted.
 *
 * Forgiving about how it arrives, because it arrives by email and is retyped or
 * pasted by hand: case is normalized, and *all* whitespace is removed rather
 * than just trimmed, so a code a mail client wrapped across two lines still
 * works. The dashes are required — they are the one part of the shape a buyer
 * can see, and accepting a dashless code would mean accepting typos as codes.
 */
export function isValidFoilCode(input: string): boolean {
  const match = CODE_SHAPE.exec(input.replace(/\s+/g, '').toUpperCase());
  return match !== null && checkDigits(match[1]) === match[2];
}
