import {
  DEFAULT_LOW_ENERGY_PERCENT,
  isLowEnergy,
  lowEnergyThreshold,
} from './low-energy';

describe('low-energy thresholds (NF-08, CL-11)', () => {
  it('defaults to the 30 % recommended by Colbits', () => {
    expect(DEFAULT_LOW_ENERGY_PERCENT).toBe(30);
    expect(lowEnergyThreshold(undefined)).toBe(30);
  });

  it('takes a configured percentage', () => {
    expect(lowEnergyThreshold('45')).toBe(45);
    expect(lowEnergyThreshold(12.5)).toBe(12.5);
  });

  it.each(['abc', '0', '-5', '101', ''])(
    'falls back to the default for an invalid setting (%p)',
    (value) => {
      expect(lowEnergyThreshold(value)).toBe(30);
    },
  );

  it('a level below the threshold is low; at or above it is not (F-44, F-45)', () => {
    expect(isLowEnergy(29, 30)).toBe(true);
    expect(isLowEnergy(30, 30)).toBe(false);
    expect(isLowEnergy(80, 30)).toBe(false);
    expect(isLowEnergy(null, 30)).toBeNull();
  });

  it('NF-08 acceptance: raising the threshold makes a reading between both values low', () => {
    expect(isLowEnergy(35, lowEnergyThreshold(undefined))).toBe(false);
    expect(isLowEnergy(35, lowEnergyThreshold('40'))).toBe(true);
  });
});
