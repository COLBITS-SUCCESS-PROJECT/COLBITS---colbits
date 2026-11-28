import {
  SmacPfReadingDto,
  SmacPwReadingDto,
  SmacVcReadingDto,
} from './dto/node-telemetry.dto';
import {
  DEFAULT_SMAC_ALIGNMENT_TOLERANCE_SECONDS,
  alignSmacReadings,
  resolveSmacAlignmentToleranceSeconds,
} from './smac-alignment';

function vcAt(
  recorded_at: string,
  overrides: Partial<SmacVcReadingDto> = {},
): SmacVcReadingDto {
  return {
    recorded_at,
    hw_id: '0501000002',
    internal_temperature: 35.2,
    battery_per: 92,
    va: 127.1,
    vb: 126.8,
    vc: 127.4,
    ia: 12.3,
    ib: 11.9,
    ic: 12.1,
    in_: 0.4,
    cuf_percent: 2.1,
    vuf_percent: 0.8,
    load_percent: 64.5,
    ...overrides,
  };
}

function pwAt(
  recorded_at: string,
  overrides: Partial<SmacPwReadingDto> = {},
): SmacPwReadingDto {
  return {
    recorded_at,
    hw_id: '0501000002',
    phase_a_active_power: 1200,
    phase_b_active_power: 1150,
    phase_c_active_power: 1180,
    phase_a_reactive_power: 300,
    phase_b_reactive_power: 290,
    phase_c_reactive_power: 310,
    phase_a_apparent_power: 1237,
    phase_b_apparent_power: 1186,
    ...overrides,
  };
}

function pfAt(
  recorded_at: string,
  overrides: Partial<SmacPfReadingDto> = {},
): SmacPfReadingDto {
  return {
    recorded_at,
    hw_id: '0501000002',
    phase_c_apparent_power: 1220,
    phase_a_power_factor: 0.97,
    phase_b_power_factor: 0.96,
    phase_c_power_factor: 0.95,
    ...overrides,
  };
}

describe('SMAC telemetry alignment (SCRUM-308 · F-73, NF-12, CL-22)', () => {
  describe('resolveSmacAlignmentToleranceSeconds', () => {
    it('defaults to 120 seconds (2 minutes, CL-22) when unset or invalid', () => {
      expect(DEFAULT_SMAC_ALIGNMENT_TOLERANCE_SECONDS).toBe(120);
      expect(resolveSmacAlignmentToleranceSeconds(undefined)).toBe(120);
      expect(resolveSmacAlignmentToleranceSeconds(null)).toBe(120);
      expect(resolveSmacAlignmentToleranceSeconds('')).toBe(120);
      expect(resolveSmacAlignmentToleranceSeconds('abc')).toBe(120);
      expect(resolveSmacAlignmentToleranceSeconds('-5')).toBe(120);
    });

    it('accepts valid non-negative numbers from configuration', () => {
      expect(resolveSmacAlignmentToleranceSeconds('30')).toBe(30);
      expect(resolveSmacAlignmentToleranceSeconds('5')).toBe(5);
      expect(resolveSmacAlignmentToleranceSeconds(0)).toBe(0);
    });
  });

  describe('alignSmacReadings', () => {
    it('joins vc, pw, and pf records 12 seconds apart into one point without loss when tolerance is 30s', () => {
      const vc = [vcAt('2026-10-29T15:00:00.000Z')];
      const pw = [pwAt('2026-10-29T15:00:12.000Z')];
      const pf = [pfAt('2026-10-29T15:00:24.000Z')];

      const aligned = alignSmacReadings(vc, pw, pf, 30);

      expect(aligned).toHaveLength(1);
      expect(aligned[0]).toEqual({
        recorded_at: '2026-10-29T15:00:00.000Z',
        hw_id: '0501000002',
        internal_temperature: 35.2,
        battery_per: 92,
        va: 127.1,
        vb: 126.8,
        vc: 127.4,
        ia: 12.3,
        ib: 11.9,
        ic: 12.1,
        in_: 0.4,
        cuf_percent: 2.1,
        vuf_percent: 0.8,
        load_percent: 64.5,
        phase_a_active_power: 1200,
        phase_b_active_power: 1150,
        phase_c_active_power: 1180,
        phase_a_reactive_power: 300,
        phase_b_reactive_power: 290,
        phase_c_reactive_power: 310,
        phase_a_apparent_power: 1237,
        phase_b_apparent_power: 1186,
        phase_c_apparent_power: 1220,
        phase_a_power_factor: 0.97,
        phase_b_power_factor: 0.96,
        phase_c_power_factor: 0.95,
      });
    });

    it('keeps records 12 seconds apart separate without loss when tolerance is 5s', () => {
      const vc = [vcAt('2026-10-29T15:00:00.000Z')];
      const pw = [pwAt('2026-10-29T15:00:12.000Z')];
      const pf = [pfAt('2026-10-29T15:00:24.000Z')];

      const aligned = alignSmacReadings(vc, pw, pf, 5);

      expect(aligned).toHaveLength(3);
      expect(aligned[0].recorded_at).toBe('2026-10-29T15:00:00.000Z');
      expect(aligned[0].va).toBe(127.1);
      expect(aligned[0].phase_a_active_power).toBeNull();
      expect(aligned[0].phase_a_power_factor).toBeNull();

      expect(aligned[1].recorded_at).toBe('2026-10-29T15:00:12.000Z');
      expect(aligned[1].va).toBeNull();
      expect(aligned[1].phase_a_active_power).toBe(1200);
      expect(aligned[1].phase_a_power_factor).toBeNull();

      expect(aligned[2].recorded_at).toBe('2026-10-29T15:00:24.000Z');
      expect(aligned[2].va).toBeNull();
      expect(aligned[2].phase_a_active_power).toBeNull();
      expect(aligned[2].phase_a_power_factor).toBe(0.97);
    });

    it('uses 120 seconds (2 minutes) by default', () => {
      const vc = [vcAt('2026-10-29T15:00:00.000Z')];
      const pw = [pwAt('2026-10-29T15:01:59.000Z')];
      const pf = [pfAt('2026-10-29T15:02:00.000Z')];

      const aligned = alignSmacReadings(vc, pw, pf);

      expect(aligned).toHaveLength(1);
      expect(aligned[0].va).toBe(127.1);
      expect(aligned[0].phase_a_active_power).toBe(1200);
      expect(aligned[0].phase_a_power_factor).toBe(0.97);
    });

    it('starts a new point rather than overwriting when two records from the same table fall inside the tolerance', () => {
      const vc = [
        vcAt('2026-10-29T15:00:00.000Z', { va: 120 }),
        vcAt('2026-10-29T15:00:10.000Z', { va: 125 }),
      ];

      const aligned = alignSmacReadings(vc, [], [], 30);

      expect(aligned).toHaveLength(2);
      expect(aligned.map((point) => point.va)).toEqual([120, 125]);
    });
  });
});