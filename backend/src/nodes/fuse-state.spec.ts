import { deriveFuseState, FuseSummary } from './fuse-state';

const ALL_GOOD: FuseSummary = {
  fuseCount: 3,
  anyOpen: false,
  anyWithoutVoltage: false,
  anyInactive: false,
};

describe('deriveFuseState (US6 · F-15 to F-18)', () => {
  it('F-15: is red when a fuse is open, even if another one has no voltage or is inactive', () => {
    expect(
      deriveFuseState({
        ...ALL_GOOD,
        anyOpen: true,
        anyWithoutVoltage: true,
        anyInactive: true,
      }),
    ).toBe('CRITICAL');
  });

  it('F-16: is yellow when no fuse is open but one has no voltage, even with an inactive Falcon', () => {
    expect(
      deriveFuseState({
        ...ALL_GOOD,
        anyWithoutVoltage: true,
        anyInactive: true,
      }),
    ).toBe('WARNING');
  });

  it('F-17: is gray when nothing is open or without voltage but a Falcon is inactive', () => {
    expect(deriveFuseState({ ...ALL_GOOD, anyInactive: true })).toBe(
      'INACTIVE',
    );
  });

  it('F-18: is green when every Falcon reported in time, closed and with voltage', () => {
    expect(deriveFuseState(ALL_GOOD)).toBe('NORMAL');
  });

  it('returns null for a node without fuses, so it is not drawn on the fuse layer', () => {
    expect(deriveFuseState({ ...ALL_GOOD, fuseCount: 0 })).toBeNull();
  });
});
