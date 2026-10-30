import { describe, expect, test } from '@jest/globals';

import { evaluateAlerts, type AlertSnapshot } from '@/domain';

const settings = {
  enabled: { dieselCross: true, followedDrop: true, deltaTolerance: true },
  dieselThreshold: 3.25,
  tolerance: 3,
};
const snap = (dieselPrice: number, deltaAbs: number, milk = 3.89): AlertSnapshot => ({
  dieselPrice,
  deltaAbs,
  itemPrices: { milk },
});
const run = (prev: AlertSnapshot | null, cur: AlertSnapshot, s = settings) =>
  evaluateAlerts({
    settings: s,
    previous: prev,
    current: cur,
    seriesName: 'Gulf Coast (PADD 3)',
    itemNames: { milk: 'Whole milk' },
  });

describe('evaluateAlerts', () => {
  test('the first run only sets a baseline', () => {
    expect(run(null, snap(3.0, 9, 1))).toEqual([]);
  });

  test('diesel crossing the threshold in either direction', () => {
    expect(run(snap(3.3, 1), snap(3.2, 1))).toEqual([
      {
        kind: 'dieselCross',
        title: 'Diesel fell below $3.25/gal',
        body: 'Gulf Coast (PADD 3) diesel is $3.20/gal, from $3.30 last week.',
        url: '/',
      },
    ]);
    expect(run(snap(3.2, 1), snap(3.25, 1))[0]?.title).toBe('Diesel rose above $3.25/gal');
    expect(run(snap(3.2, 1), snap(3.1, 1))).toEqual([]);
  });

  test('followed item drops link to the item', () => {
    expect(run(snap(3.5, 1, 3.89), snap(3.5, 1, 3.59))).toEqual([
      {
        kind: 'followedDrop',
        title: 'Whole milk dropped to $3.59',
        body: 'Down $0.30 from $3.89.',
        url: '/item/milk',
      },
    ]);
    expect(run(snap(3.5, 1, 3.59), snap(3.5, 1, 3.89))).toEqual([]);
  });

  test('Delta tolerance fires once when crossed, not while it stays above', () => {
    expect(run(snap(3.5, 2.5), snap(3.5, 4.0))[0]?.title).toBe('Your Delta widened to 4.0 pts');
    expect(run(snap(3.5, 4.0), snap(3.5, 4.5))).toEqual([]);
  });

  test('disabled alerts stay quiet', () => {
    const off = {
      ...settings,
      enabled: { dieselCross: false, followedDrop: false, deltaTolerance: false },
    };
    expect(run(snap(3.3, 1, 3.89), snap(3.2, 5, 3.0), off)).toEqual([]);
  });
});
