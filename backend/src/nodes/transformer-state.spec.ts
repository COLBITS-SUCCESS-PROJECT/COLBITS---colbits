import {
  PHASE_DROP_EVENT_PATTERN,
  TransformerSummary,
  deriveTransformerState,
  phaseCountOf,
  phaseOfChannel,
  phasesDown,
} from './transformer-state';

const three = (
  downChannels: string[],
  inactive = false,
): TransformerSummary => ({
  customId: '0000100004-T1-3',
  inactive,
  downChannels,
});
const two = (downChannels: string[], inactive = false): TransformerSummary => ({
  customId: '0000100005-T1-2',
  inactive,
  downChannels,
});

describe('deriveTransformerState (US7 · RF-MAP-04)', () => {
  it('F-19: two or more phases down is CRITICAL', () => {
    expect(deriveTransformerState([three(['A', 'B'])])).toBe('CRITICAL');
    expect(deriveTransformerState([three(['A', 'B', 'C'])])).toBe('CRITICAL');
  });

  it('F-20: exactly one phase down is WARNING', () => {
    expect(deriveTransformerState([three(['C'])])).toBe('WARNING');
  });

  it('F-21: no phase down and the SMAC inactive is INACTIVE', () => {
    expect(deriveTransformerState([three([], true)])).toBe('INACTIVE');
  });

  it('F-22: no phase down and the SMAC active is NORMAL', () => {
    expect(deriveTransformerState([three([])])).toBe('NORMAL');
  });

  it('strict precedence: phases down win over inactivity', () => {
    expect(deriveTransformerState([three(['A'], true)])).toBe('WARNING');
    expect(deriveTransformerState([three(['A', 'B'], true)])).toBe('CRITICAL');
  });

  it('F-23: a two-phase transformer with both phases down is CRITICAL, not WARNING', () => {
    expect(deriveTransformerState([two(['A', 'B'])])).toBe('CRITICAL');
  });

  it('F-23: an event on phase C of a two-phase transformer does not count', () => {
    expect(deriveTransformerState([two(['A', 'C'])])).toBe('WARNING');
    expect(deriveTransformerState([two(['C'])])).toBe('NORMAL');
  });

  it('a node with several transformers takes the most severe state', () => {
    expect(deriveTransformerState([three([]), three(['A'])])).toBe('WARNING');
    expect(deriveTransformerState([three([], true), three([])])).toBe(
      'INACTIVE',
    );
    expect(deriveTransformerState([three(['A']), two(['A', 'B'])])).toBe(
      'CRITICAL',
    );
  });

  it('is null for a node without transformers (hidden on that layer)', () => {
    expect(deriveTransformerState([])).toBeNull();
  });
});

describe('transformer identifiers and channels (Annex §3.3, §4.2)', () => {
  it('reads the phase count at the end of the identifier', () => {
    expect(phaseCountOf('0000226153-T1-3')).toBe(3);
    expect(phaseCountOf('0000100005-T1-2')).toBe(2);
    expect(phaseCountOf('0000100005-T1')).toBeNull();
    expect(phaseCountOf('0000100005-T1-4')).toBeNull();
  });

  it('accepts letters (seed, generator) and digits (Annex text) as channels', () => {
    expect(phaseOfChannel('A')).toBe(1);
    expect(phaseOfChannel('c')).toBe(3);
    expect(phaseOfChannel('2')).toBe(2);
    expect(phaseOfChannel('X')).toBeNull();
  });

  it('counts an unknown channel, but never above the phase count', () => {
    expect(phasesDown(three(['X']))).toBe(1);
    expect(phasesDown(two(['A', 'B', 'X']))).toBe(2);
  });

  it('counts every channel when the identifier has no phase count', () => {
    expect(
      phasesDown({
        customId: 'LEGACY-T1',
        inactive: false,
        downChannels: ['A', 'C'],
      }),
    ).toBe(2);
  });

  it('uses the Annex phase-drop pattern (05xx21y), not phase out of range (05xx20y)', () => {
    const pattern = new RegExp(PHASE_DROP_EVENT_PATTERN);
    expect(pattern.test('051421C')).toBe(true);
    expect(pattern.test('051420A')).toBe(false);
    expect(pattern.test('131421')).toBe(false);
  });
});
