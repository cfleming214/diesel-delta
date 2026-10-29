import { describe, expect, test } from '@jest/globals';

import {
  ALL_SERIES,
  eiaSeriesId,
  fuelArea,
  localSeries,
  regionForState,
  stateForZip,
  STATES,
} from '@/data';

describe('ZIP → state', () => {
  test.each([
    ['77002', 'TX'],
    ['10001', 'NY'],
    ['94110', 'CA'],
    ['02108', 'MA'],
    ['20500', 'DC'],
    ['99501', 'AK'],
    ['96813', 'HI'],
    ['73301', 'TX'], // 733 is a Texas prefix inside Oklahoma's range
    ['05501', 'MA'], // 055 is a Massachusetts prefix inside Vermont's range
  ])('%s is %s', (zip, state) => expect(stateForZip(zip)).toBe(state));

  test('territories, military and malformed input are unsupported', () => {
    for (const zip of ['00901', '09001', '96201', '96910', '7700', 'abcde']) {
      expect(stateForZip(zip)).toBeNull();
    }
  });
});

describe('PADD regions', () => {
  test('all 50 states plus DC are mapped', () => {
    expect(Object.keys(STATES)).toHaveLength(51);
  });

  test.each([
    ['ME', 'east'],
    ['NY', 'east'],
    ['FL', 'east'],
    ['OK', 'mid'],
    ['TN', 'mid'],
    ['NM', 'gulf'],
    ['TX', 'gulf'],
    ['CO', 'rocky'],
    ['AK', 'west'],
    ['AZ', 'west'],
  ])('%s is in %s', (state, region) => expect(regionForState(state)).toBe(region));
});

describe('EIA series selection', () => {
  test('California is the only state diesel series', () => {
    expect(localSeries('CA', 'diesel')).toEqual({ area: 'SCA', name: 'California', isState: true });
    expect(localSeries('TX', 'diesel')).toBeNull();
    expect(localSeries('TX', 'gas')).toEqual({ area: 'STX', name: 'Texas', isState: true });
  });

  test('PADD 1 sub-regions and West Coast except California', () => {
    expect(localSeries('ME', 'diesel')?.area).toBe('R1X');
    expect(localSeries('PA', 'diesel')?.area).toBe('R1Y');
    expect(localSeries('GA', 'diesel')?.area).toBe('R1Z');
    expect(localSeries('FL', 'gas')?.area).toBe('SFL');
    expect(localSeries('OR', 'diesel')).toEqual({
      area: 'R5XCA',
      name: 'West Coast except California',
      isState: false,
    });
  });

  test('fuelArea per scope, with state scope falling back to the PADD', () => {
    expect(fuelArea('TX', 'diesel', 'national')).toBe('NUS');
    expect(fuelArea('TX', 'diesel', 'padd')).toBe('R30');
    expect(fuelArea('TX', 'diesel', 'state')).toBe('R30');
    expect(fuelArea('CA', 'diesel', 'state')).toBe('SCA');
    expect(fuelArea('ME', 'diesel', 'padd')).toBe('R10');
  });

  test('series IDs', () => {
    expect(eiaSeriesId('NUS', 'diesel')).toBe('EMD_EPD2D_PTE_NUS_DPG');
    expect(eiaSeriesId('STX', 'gas')).toBe('EMM_EPMR_PTE_STX_DPG');
    expect(ALL_SERIES.filter((s) => s.kind === 'diesel')).toHaveLength(11);
    expect(ALL_SERIES.filter((s) => s.kind === 'gas')).toHaveLength(19);
  });
});
