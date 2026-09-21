import { describe, it, expect } from 'vitest';
import { isValidFoilCode } from './foilCode';
// The real minting script, not a copy of it. Importing the artifact we actually
// run is the whole point: it is the only thing standing between the ten
// duplicated lines in that file and a buyer being mailed a code the app
// rejects.
import { ALPHABET, mintFoilCode } from '../../../scripts/foil-code.mjs';

/**
 * A code minted by the shipped script, written down.
 *
 * Pinned deliberately. Every other assertion here mints fresh, so a change to
 * the salt or the hash would keep passing while silently invalidating every
 * code already in a buyer's inbox. This literal is the one thing that fails
 * when that happens — see the rotation note in `foilCode.ts`. If you meant to
 * rotate, mint a new one and update this and the e2e specs together.
 */
const ISSUED_CODE = 'FOIL-9YEVN-Y6A';

describe('isValidFoilCode', () => {
  it('accepts a code the shipped script minted', () => {
    // 200 rather than one: the check digits are three characters, so a broken
    // implementation that agreed with the script one time in a thousand would
    // otherwise pass this suite most days.
    for (let i = 0; i < 200; i++) {
      const code = mintFoilCode();
      expect(isValidFoilCode(code), code).toBe(true);
    }
  });

  it('still accepts a code minted before today', () => {
    expect(isValidFoilCode(ISSUED_CODE)).toBe(true);
  });

  it('mints only from the unambiguous alphabet', () => {
    // `I`/`1` and `O`/`0` are left out so a buyer retyping from an email never
    // has to guess which one they are looking at.
    expect(ALPHABET).not.toMatch(/[IO01]/);
    for (let i = 0; i < 50; i++) {
      expect(mintFoilCode()).toMatch(/^FOIL-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{3}$/);
    }
  });

  it('rejects a code whose body was altered', () => {
    // The failure that matters: one character off, which is what a typo is.
    expect(isValidFoilCode('FOIL-9YEVM-Y6A')).toBe(false);
  });

  it('rejects a code whose check digits were altered', () => {
    expect(isValidFoilCode('FOIL-9YEVN-Y6B')).toBe(false);
  });

  it('rejects check digits borrowed from another code', () => {
    // Proves the digits are derived from the body rather than being decoration
    // that any well-formed trailer satisfies.
    const [, bodyA] = /^FOIL-(\w{5})-(\w{3})$/.exec(mintFoilCode()) ?? [];
    const [, , checkB] = /^FOIL-(\w{5})-(\w{3})$/.exec(mintFoilCode()) ?? [];
    expect(isValidFoilCode(`FOIL-${bodyA}-${checkB}`)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isValidFoilCode(ISSUED_CODE.toLowerCase())).toBe(true);
  });

  it('survives the whitespace an email adds', () => {
    // Copy-paste brings padding; a mail client may wrap the line outright.
    expect(isValidFoilCode(`  ${ISSUED_CODE}  `)).toBe(true);
    expect(isValidFoilCode('FOIL-9YEVN\n-Y6A')).toBe(true);
  });

  it('rejects a code missing its dashes', () => {
    // Accepting this would mean accepting a whole class of mistyped strings as
    // codes, and the dashes are the only part of the shape a buyer can see.
    expect(isValidFoilCode('FOIL9YEVNY6A')).toBe(false);
  });

  it.each(['', '   ', 'FOIL-', 'FOIL-9YEVN', 'NOPE-9YEVN-Y6A', 'FOIL-9YEVN-Y6A-Y6A'])(
    'rejects %o',
    (input) => {
      expect(isValidFoilCode(input)).toBe(false);
    },
  );

  it('rejects an ambiguous character even where the shape fits', () => {
    // `I`, `O`, `0` and `1` are not in the alphabet, so a code carrying one was
    // mistyped rather than minted — reject it instead of hashing it anyway.
    expect(isValidFoilCode('FOIL-9YEVI-Y6A')).toBe(false);
    expect(isValidFoilCode('FOIL-9YEV0-Y6A')).toBe(false);
  });
});
