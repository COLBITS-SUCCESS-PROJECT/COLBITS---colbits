import { ConfigService } from '@nestjs/config';
import { FaultsService } from './faults.service';

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
});
