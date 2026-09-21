#!/usr/bin/env node
/**
 * Mint a foil license code.
 *
 *   node scripts/foil-code.mjs        # one code
 *   node scripts/foil-code.mjs 5      # five
 *
 * That is the entire fulfillment mechanism. There is no list of issued codes
 * anywhere, and nothing to deploy after running this: a code is valid because
 * its check digits agree with its body, and the function that decides that
 * shipped with the app. See `docs/FOIL_CODES.md`.
 *
 * ── Why this file duplicates ten lines of `src/features/cosmetics/foilCode.ts` ──
 * So that issuing a code is `node scripts/foil-code.mjs` and nothing else — no
 * build step, no loader flag, no dev dependency, on any Node that can run the
 * repo. Importing the TypeScript module directly would cost one of those, and
 * the friction this whole design exists to remove is exactly that kind.
 *
 * The duplication cannot silently drift: `foilCode.test.ts` imports this file,
 * mints real codes with it, and asserts the app validates every one. If the two
 * ever disagree, that test fails before a bad code reaches a buyer.
 */

/**
 * Base32 minus `I`, `O`, `0` and `1` — the four characters someone retyping a
 * code from an email would have to guess between. Must match `ALPHABET` in
 * `src/features/cosmetics/foilCode.ts`.
 */
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Must match `SALT` in `src/features/cosmetics/foilCode.ts`. */
const SALT = 'aura-foil-v1';

/**
 * Three check characters derived from the body — FNV-1a, salted.
 *
 * Must match `checkDigits` in `src/features/cosmetics/foilCode.ts`.
 */
export function checkDigits(body) {
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

/** A fresh code, e.g. `FOIL-7X2QF-K4M`. */
export function mintFoilCode() {
  // 256 is a whole multiple of 32, so the modulo is unbiased — every character
  // of the alphabet is equally likely, with no rejection loop.
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const body = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
  return `FOIL-${body}-${checkDigits(body)}`;
}

// Only when run as a command. The test imports this file, and an import that
// printed to stdout would make the suite noisy for no reason.
if (process.argv[1]?.endsWith('foil-code.mjs')) {
  const count = Number.parseInt(process.argv[2] ?? '1', 10);
  for (let i = 0; i < (Number.isInteger(count) && count > 0 ? count : 1); i++) {
    console.log(mintFoilCode());
  }
}
