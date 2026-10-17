// Seeded pseudo-random generator (mulberry32). Same seed => same sequence => same dataset (F-96).

export type Rng = {
  /** Float in [0, 1). */
  next: () => number;
  /** Integer in [min, max], both inclusive. */
  int: (min: number, max: number) => number;
  /** Float in [min, max). */
  range: (min: number, max: number) => number;
  /** Normal-ish noise with the given standard deviation (sum of uniforms). */
  noise: (sd: number) => number;
  /** True with probability p. */
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  /** Fisher-Yates shuffle of a copy. */
  shuffle: <T>(items: readonly T[]) => T[];
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const range = (min: number, max: number): number => min + next() * (max - min);
  const noise = (sd: number): number => (next() + next() + next() + next() - 2) * sd * 1.732;
  const chance = (p: number): boolean => next() < p;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  return { next, int, range, noise, chance, pick, shuffle };
}

/** Independent stream for a sub-task, so adding data in one place never shifts another. */
export function deriveSeed(seed: number, label: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}
