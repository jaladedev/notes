// Deterministic per-attempt shuffling. The order is a pure function of the
// attempt id, so a student sees the same order after a refresh or on
// another device, while different students (different attempt ids) get
// different orders. Nothing is stored.

/** FNV-1a 32-bit hash of a string. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast seeded PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle driven by `seed`. Returns a new array; never mutates the input. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Orders questions for an attempt: shuffled when the quiz asks for it, authored order otherwise. */
export function orderQuestionsForAttempt<T extends { sequence_order: number }>(
  questions: readonly T[],
  attemptId: string,
  shuffle: boolean
): T[] {
  const authored = [...questions].sort((a, b) => a.sequence_order - b.sequence_order);
  return shuffle ? seededShuffle(authored, attemptId) : authored;
}
