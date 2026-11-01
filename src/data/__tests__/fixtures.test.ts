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
import { productSummaries } from '@/data/products';
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
    30: { fuelPct: -0.22224574461848276, basketPct: 1.7899761336515558, severity: 'Moderate lag' },
    60: { fuelPct: -1.8112649218483334, basketPct: 1.7899761336515558, severity: 'Wide gap' },
    90: { fuelPct: -4.249969091800477, basketPct: 2.2475277195085406, severity: 'Wide gap' },
    365: { fuelPct: -1.9553449870973474, basketPct: 6.2266500622664775, severity: 'Wide gap' },
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
    expect(a.from).toBeCloseTo(96.394, 3);
    expect(a.to).toBe(101.52);
    expect(smoney(a.change)).toBe('+$5.13');
    expect(smoney(a.fuelAttributable)).toBe('−$0.23');
    expect(smoney(a.noFuelLink)).toBe('+$5.35');
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
  test('milk (Gouge Gap) model, from its Walmart price history', async () => {
    const milk = await api.getItem('milk', 'gulf');
    expect(milk.verdict).toBe('gouge');
    expect(milk.store).toBe('Walmart');
    expect(milk.price).toBe(3.89);
    expect(milk.basePrice).toBe(3.59);
    expect(milk.unreturned).toBeCloseTo(0.3, 10);
    expect(milk.changePct).toBeCloseTo(8.356545961002794, 10);
    expect(milk.fuelSincePct).toBeCloseTo(-8.977634736131046, 10);
    expect(milk.rises).toBe(1);
    expect(milk.weeklyPrice).toHaveLength(53);
    expect(milk.spark).toHaveLength(15);
    expect(milk.ledger).toHaveLength(1);
    expect(milk.ledger[0]).toMatchObject({ from: 3.59, to: 3.89, tag: 'Fuel-correlated' });
    expect(formatDate(fromISODate(milk.ledger[0]!.date), true)).toBe('Jan 23, 2026');
  });

  test('every item agrees with its product: store, price and 1-year change', async () => {
    for (const p of productSummaries()) {
      const item = await api.getItem(p.id, 'mid');
      expect([item.id, item.store, item.price]).toEqual([p.id, p.retailer, p.price]);
      expect(item.changePct).toBeCloseTo(p.change.d365!, 10);
      expect(item.weeklyPrice.at(-1)).toBe(p.price);
      // Only items owing a rollback carry an unreturned amount.
      if (item.verdict === 'track') expect(item.unreturned).toBe(0);
      else expect(item.unreturned).toBeGreaterThan(0);
    }
  });

  test('ledger tags follow diesel and the latest run of rises', async () => {
    const rice = await api.getItem('rice', 'mid');
    expect(rice.verdict).toBe('sticky');
    expect(rice.ledger.map((l) => [l.from, l.to, l.tag])).toEqual([
      [5.49, 5.19, 'Partial rollback'],
      [4.99, 5.49, 'No fuel link'],
      [4.79, 4.99, 'No fuel link'],
    ]);
    expect(rice.unreturned).toBeCloseTo(0.4, 10);
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
      'Diesel Data covers ZIP codes in the 50 states and DC.',
    );
  });
});
