import { describe, expect, test } from '@jest/globals';

import {
  basketAttribution,
  baselineIndex,
  bestLag,
  computeDelta,
  correlationAtLag,
  formatDate,
  fromISODate,
  indexWindow,
  smoney,
  WINDOWS,
} from '@/domain';
import { api } from '@/data';
import { matchCatalog } from '@/data/fixtureApi';
import { DEFAULT_BASKET_IDS } from '@/data/fixtures/catalog';
import { BASKET, DAYS, FUEL, GAS, YEAR_START, dateAt } from '@/data/fixtures/series';

// Golden values were produced by running the prototype's own logic block
// (design/handoff/DieselDeltaApp.dc.html) for ZIP 77002 (Gulf Coast).

describe('fixture series match the prototype', () => {
  test('generated samples', () => {
    expect(DAYS).toBe(449);
    expect(FUEL[0]).toBeCloseTo(3.49, 10);
    expect(FUEL[100]).toBeCloseTo(3.5435021002348908, 10);
    expect(FUEL[DAYS - 1]).toBeCloseTo(3.4398055901367957, 10);
    expect(GAS[200]).toBeCloseTo(3.4386298533504176, 10);
    expect(BASKET[0]).toBe(96.1);
    expect(BASKET[300]).toBe(101.9);
  });

  test('date axis', () => {
    expect(formatDate(dateAt(0), true)).toBe('Aug 4, 2025');
    expect(formatDate(dateAt(DAYS - 1))).toBe('Oct 26');
  });
});

describe('golden: Delta for ZIP 77002', () => {
  const golden = {
    30: { fuelPct: -0.22224574461848276, basketPct: -0.08857395925598209, severity: 'In step' },
    60: { fuelPct: -1.8112649218483334, basketPct: -0.17204392430068596, severity: 'Moderate lag' },
    90: { fuelPct: -4.249969091800477, basketPct: -0.2545724598884369, severity: 'Wide gap' },
    365: { fuelPct: -1.9553449870973474, basketPct: 5.317652144156464, severity: 'Wide gap' },
  } as const;

  test.each(WINDOWS.map((w) => w.days))('%i-day window', async (days) => {
    const { dieselSeries } = await api.lookupZip('77002');
    expect(dieselSeries).toEqual({ area: 'R30', name: 'Gulf Coast (PADD 3)', level: 'padd' });
    const fuel = (await api.getFuelSeries(dieselSeries.area, 'diesel')).values;
    const basket = (await api.getBasketSeries(DEFAULT_BASKET_IDS)).values;
    const r = computeDelta(fuel, basket, days);
    expect(r.fuelPct).toBeCloseTo(golden[days].fuelPct, 10);
    expect(r.basketPct).toBeCloseTo(golden[days].basketPct, 10);
    expect(r.severity).toBe(golden[days].severity);
  });

  test('best lag and correlation', () => {
    expect(bestLag(FUEL, BASKET, YEAR_START).weeks).toBe(12);
    expect(correlationAtLag(FUEL, BASKET, YEAR_START, 0)).toBeCloseTo(-0.0026646051307908244, 10);
    expect(correlationAtLag(FUEL, BASKET, YEAR_START, 4)).toBeCloseTo(0.38211660437916667, 10);
  });

  test('chart header values at the latest day (90D)', () => {
    const { fuel, basket } = indexWindow(FUEL, BASKET, DAYS - 91, DAYS - 1);
    expect(basket.at(-1)!.toFixed(1)).toBe('99.7');
    expect(fuel.at(-1)!.toFixed(1)).toBe('95.8');
  });

  test('basket attribution (1Y baseline)', () => {
    const a = basketAttribution(BASKET, FUEL, baselineIndex(DAYS, '1Y'));
    expect(a.from).toBe(96.4);
    expect(a.to).toBe(101.52);
    expect(smoney(a.change)).toBe('+$5.12');
    expect(smoney(a.fuelAttributable)).toBe('−$0.21');
    expect(smoney(a.noFuelLink)).toBe('+$5.33');
  });

  test('regional 90D fuel changes', async () => {
    const golden = {
      R10: -3.8188582737317835,
      R20: -4.682462521453046,
      R40: -3.3891234478489,
      R50: -2.960758036941243,
      NUS: -4.034241271023244,
    } as const;
    for (const [area, expected] of Object.entries(golden)) {
      const fuel = (await api.getFuelSeries(area as keyof typeof golden, 'diesel')).values;
      expect(computeDelta(fuel, fuel, 90).fuelPct).toBeCloseTo(expected, 10);
    }
  });
});

describe('items', () => {
  test('milk (Gouge Gap) model', async () => {
    const milk = await api.getItem('milk', 'gulf');
    expect(milk.basePrice).toBeCloseTo(3.4232, 10);
    expect(milk.unreturned).toBeCloseTo(0.4668, 10);
    expect(milk.changePct).toBeCloseTo(13.636363636363638, 10);
    expect(milk.fuelSincePct).toBeCloseTo(-13.320868266147526, 10);
    expect(milk.weeklyPrice).toHaveLength(53);
    expect(milk.spark).toHaveLength(15);
    expect(milk.ledger.map((l) => l.tag)).toEqual(['Fuel-correlated', 'Fuel-correlated']);
    expect(milk.ledger[0]!.from).toBeCloseTo(3.6566, 10);
    expect(formatDate(fromISODate(milk.ledger[1]!.date), true)).toBe('Feb 9, 2026');
  });

  test('unknown items reject', async () => {
    await expect(api.getItem('nope', 'gulf')).rejects.toThrow('Unknown item nope');
  });
});

describe('search', () => {
  test('word-AND matching across name, size, category and store', () => {
    expect(matchCatalog('heinz ketchup').items.map((i) => i.id)).toEqual(['ketchup', 'ketchup20']);
    expect(matchCatalog('heinz 32').items.map((i) => i.id)).toEqual(['ketchup']);
    expect(matchCatalog('dairy kroger').items.map((i) => i.id)).toEqual([
      'milk2',
      'eggs',
      'cream_cheese',
      'sour_cream',
    ]);
    expect(matchCatalog('  ').items).toEqual([]);
    expect(matchCatalog('caviar').items).toEqual([]);
  });

  test('pasted retailer links resolve', () => {
    const r = matchCatalog('https://www.target.com/p/heinz-ketchup-32oz');
    expect(r.resolvedFromLink).toBe(true);
    expect(r.items.map((i) => i.id)).toEqual(['ketchup']);
  });
});

describe('zip lookup', () => {
  test('resolves state, PADD and diesel series; rejects bad input', async () => {
    const tx = await api.lookupZip('77002');
    expect(tx.state).toEqual({ abbr: 'TX', name: 'Texas' });
    expect(tx.region).toEqual({ key: 'gulf', name: 'Gulf Coast (PADD 3)' });
    const ca = await api.lookupZip('94110');
    expect(ca.region.name).toBe('West Coast (PADD 5)');
    expect(ca.dieselSeries).toEqual({ area: 'SCA', name: 'California', level: 'state' });
    await expect(api.lookupZip('7700')).rejects.toThrow('Enter a 5-digit US ZIP code.');
    await expect(api.lookupZip('00901')).rejects.toThrow(
      'DieselDelta covers ZIP codes in the 50 states and DC.',
    );
  });
});
