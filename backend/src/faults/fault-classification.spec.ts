import {
  canonicalPhase,
  canonicalPhases,
  classifyFault,
  FaultClassification,
} from './fault-classification';

describe('canonicalPhase (US10 · F-49)', () => {
  it.each([
    ['R', 'R'],
    [' r ', 'R'],
    ['s', 'S'],
    ['T', 'T'],
    ['I', 'I'],
    ['c', 'C'],
    ['D', 'D'],
    ['I1', 'I'],
    ['i2', 'I'],
    ['R12', 'R'],
  ])('maps %j to %j', (raw, expected) => {
    expect(canonicalPhase(raw)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['1'],
    ['RS'],
    ['R-1'],
    ['R_'],
    ['1R'],
    ['É'],
    ['X'],
    ['X1'],
    ['A'],
    [undefined],
    [null],
    [1],
  ])('returns null for %j', (raw) => {
    expect(canonicalPhase(raw as string)).toBeNull();
  });

  it('does not map legacy letters to R/S/T', () => {
    expect(canonicalPhase('I')).not.toBe('R');
    expect(canonicalPhase('C')).not.toBe('S');
    expect(canonicalPhase('D')).not.toBe('T');
  });
});

describe('canonicalPhases (US10 · F-49)', () => {
  it('returns distinct phases in the natural order of their alphabet', () => {
    expect(canonicalPhases(['T', 'r', 'S', 'R'])).toEqual(['R', 'S', 'T']);
    expect(canonicalPhases(['D', 'I', 'C'])).toEqual(['I', 'C', 'D']);
  });

  it('collapses repetition digits into one phase', () => {
    expect(canonicalPhases(['I1', 'I2'])).toEqual(['I']);
  });

  it('returns an empty array for an empty list', () => {
    expect(canonicalPhases([])).toEqual([]);
  });

  it.each([
    [['R', '']],
    [['R', 'RS']],
    [['R', 'X']],
    [['R', 'I']],
    [['R', 'I', 'C']],
  ])('returns null for %j', (raw) => {
    expect(canonicalPhases(raw)).toBeNull();
  });

  it('does not mutate its input', () => {
    const input = ['T', 'S', 'R'];
    canonicalPhases(input);
    expect(input).toEqual(['T', 'S', 'R']);
  });
});

describe('classifyFault (US10 · F-49)', () => {
  it.each<[string[], FaultClassification]>([
    [['R'], 'MONOPHASIC'],
    [['R', 'S'], 'BIPHASIC'],
    [['R', 'S', 'T'], 'TRIPHASIC'],
  ])('F-49: %j is %s', (phases, expected) => {
    expect(classifyFault(phases)).toBe(expected);
  });

  it.each<[string[], FaultClassification]>([
    [['I1', 'I2'], 'MONOPHASIC'],
    [['I1', 'I2', 'C'], 'BIPHASIC'],
    [['R1', 'R2', 'S', 'T1'], 'TRIPHASIC'],
    [['R', 'R'], 'MONOPHASIC'],
    [['r', ' S ', 't'], 'TRIPHASIC'],
  ])(
    'counts distinct canonical phases, not fuses: %j is %s',
    (phases, expected) => {
      expect(classifyFault(phases)).toBe(expected);
    },
  );

  it.each<[string[], FaultClassification]>([
    [['I'], 'MONOPHASIC'],
    [['I', 'C'], 'BIPHASIC'],
    [['I', 'C', 'D'], 'TRIPHASIC'],
  ])(
    'classifies the historical alphabet without mapping it: %j is %s',
    (phases, expected) => {
      expect(classifyFault(phases)).toBe(expected);
    },
  );

  it.each([
    ['empty list', []],
    ['empty entry', ['R', '']],
    ['malformed entry', ['R', 'RS']],
    ['unsupported letter', ['X']],
    ['unsupported letter next to a valid one', ['R', 'X']],
    ['mixed alphabets', ['R', 'I']],
    ['mixed alphabets, three phases', ['R', 'I', 'C']],
    ['more than three distinct phases', ['R', 'S', 'T', 'I']],
  ])('returns null for %s', (_label, phases) => {
    expect(classifyFault(phases)).toBeNull();
  });

  it('does not depend on the order of the input', () => {
    expect(classifyFault(['T', 'R', 'S'])).toBe(classifyFault(['R', 'S', 'T']));
  });

  it('does not mutate its input', () => {
    const input = ['T', 'S', 'R'];
    classifyFault(input);
    expect(input).toEqual(['T', 'S', 'R']);
  });
});
