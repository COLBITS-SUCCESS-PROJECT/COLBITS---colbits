import { ConfigService } from '@nestjs/config';
import { DEFAULT_FAULT_MIN_DURATION_MINUTES, FaultsService } from './faults.service';

// #CORRECTION CL-13 (2026-11-09): the getActiveFaults() test was removed with the method; a fallback test was added.
describe('FaultsService (NF-09)', () => {
  const serviceWith = (value: unknown) =>
    new FaultsService({
      get: jest.fn().mockReturnValue(value),
    } as unknown as ConfigService);

  it('reads the grouping window from ConfigService without code changes (NF-09)', () => {
    expect(serviceWith('10').getGroupingWindowMinutes()).toBe(10);
  });

  it('falls back to 5 minutes when the window is missing or invalid', () => {
    expect(serviceWith(undefined).getGroupingWindowMinutes()).toBe(5);
    expect(serviceWith('-1').getGroupingWindowMinutes()).toBe(5);
  });

  describe('getMinDurationMinutes (US21 · NF-10, SCRUM-286)', () => {
    const serviceWithConfig = (values: Record<string, string | undefined>) =>
      new FaultsService({
        get: (key: string) => values[key],
      } as unknown as ConstructorParameters<typeof FaultsService>[0]);
    it('returns the configured positive minimum duration from FAULT_MIN_DURATION_MINUTES', () => {
      const service = serviceWithConfig({ FAULT_MIN_DURATION_MINUTES: '5' });
      expect(service.getMinDurationMinutes()).toBe(5);
    });

    it.each([undefined, '', 'abc', '0', '-2'])(
      'falls back to 1 minute when FAULT_MIN_DURATION_MINUTES is %p',
      (invalid) => {
        const service = serviceWithConfig({
          FAULT_MIN_DURATION_MINUTES: invalid,
        });
        expect(service.getMinDurationMinutes()).toBe(
          DEFAULT_FAULT_MIN_DURATION_MINUTES,
        );
      },
    );
  });
});
