/**
 * Phase classification of a fault (US10 · F-49, Scope v6.0 §3.5, Technical Annex v1.1 §3.2).
 * A fault is MONOPHASIC, BIPHASIC or TRIPHASIC by its number of distinct canonical phases:
 * the phase letter without the repetition digit (`I1` and `I2` are one phase), never `custom_id`s.
 *
 * Two phase alphabets are valid, and they are never mixed or mapped to each other:
 *   current (R, S, T) — the only one the app supports (client decision, 2026-10-23)
 *   legacy  (I, C, D) — historical data, counted as its own alphabet, with no I/C/D↔R/S/T mapping
 */
export const FAULT_CLASSIFICATIONS = [
  'MONOPHASIC',
  'BIPHASIC',
  'TRIPHASIC',
] as const;
export type FaultClassification = (typeof FAULT_CLASSIFICATIONS)[number];

/** Valid phase alphabets, each in its natural order. */
export const PHASE_ALPHABETS: readonly (readonly string[])[] = [
  ['R', 'S', 'T'],
  ['I', 'C', 'D'],
];

/**
 * Canonical phase of a `fuses.phase` value: trimmed, upper-case, without repetition digit.
 * null when it is not exactly one letter of a valid alphabet.
 */
export function canonicalPhase(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const phase = raw.trim().toUpperCase().replace(/\d+$/, '');
  return PHASE_ALPHABETS.some((alphabet) => alphabet.includes(phase))
    ? phase
    : null;
}

/**
 * Distinct canonical phases in their alphabet's natural order (R, S, T / I, C, D).
 * null when any entry is not a valid phase or the phases mix both alphabets,
 * so nothing is dropped or guessed. An empty list gives an empty array.
 */
export function canonicalPhases(raw: readonly string[]): string[] | null {
  const phases = new Set<string>();
  for (const value of raw) {
    const phase = canonicalPhase(value);
    if (phase === null) return null;
    phases.add(phase);
  }
  if (phases.size === 0) return [];

  const alphabet = PHASE_ALPHABETS.find((letters) =>
    letters.includes([...phases][0]),
  );
  if (!alphabet || [...phases].some((phase) => !alphabet.includes(phase))) {
    return null;
  }
  return alphabet.filter((letter) => phases.has(letter));
}

/** null for no phases, an invalid entry or mixed alphabets, so the fault is surfaced as unclassified. */
export function classifyFault(
  phases: readonly string[],
): FaultClassification | null {
  const distinct = canonicalPhases(phases);
  if (distinct === null || distinct.length === 0) return null;
  return FAULT_CLASSIFICATIONS[distinct.length - 1];
}
