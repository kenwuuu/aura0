/**
 * Types for `foil-code.mjs`.
 *
 * The script stays plain JavaScript so that issuing a code needs nothing but
 * `node scripts/foil-code.mjs` — no loader flag, no build step, no dev
 * dependency. This file exists only so `foilCode.test.ts` can import it and
 * still type-check; nothing in `src/` depends on it at runtime.
 */

/** Base32 minus `I`, `O`, `0` and `1`. */
export declare const ALPHABET: string;

/** Three check characters derived from a code's five-character body. */
export declare function checkDigits(body: string): string;

/** A fresh code, e.g. `FOIL-7X2QF-K4M`. */
export declare function mintFoilCode(): string;
