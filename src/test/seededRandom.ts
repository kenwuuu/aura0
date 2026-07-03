/**
 * Deterministic PRNG (mulberry32) for pinning `Math.random` in shuffle tests.
 *
 * A constant return value degenerates Fisher-Yates into a trivial reversal for
 * already-sorted input, which some "did it actually shuffle" checks can't tell
 * apart from no shuffle at all. A seeded sequence avoids that pathological case
 * while staying fully deterministic and reproducible across runs.
 *
 * Usage: `vi.spyOn(Math, 'random').mockImplementation(seededRandom(42))`.
 */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
