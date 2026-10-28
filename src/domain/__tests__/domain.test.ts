import { describe, expect, test } from '@jest/globals';

import {
  basketAttribution,
  baselineIndex,
  bestLag,
  computeDelta,
  correlationAtLag,
  formatCorrelation,
  formatDate,
  gridValues,
  indexWindow,
  money,
  nearestIndex,
  paddedRange,
  pct,
  pearson,
  scaleLinear,
  severityOf,
  sgn,
  smoney,
  sparkPath,
  verdictExplanation,
  verdictSentence,
  windowInfo,
  windowRange,
} from '@/domain';

describe('format', () => {
  test('pct', () => {
    expect(pct(100, 105)).toBeCloseTo(5);
    expect(pct(4, 3)).toBeCloseTo(-25);
  });
  test('sgn uses a typographic minus and no sign for zero', () => {
    expect(sgn(4)).toBe('+4.0');
    expect(sgn(-1.84)).toBe('−1.8');
    expect(sgn(0)).toBe('0.0');
    expect(sgn(12.345, 2)).toBe('+12.35');
  });
  test('money and smoney', () => {
    expect(money(3.4)).toBe('$3.40');
    expect(smoney(5.12)).toBe('+$5.12');
    expect(smoney(-0.21)).toBe('−$0.21');
    expect(smoney(0)).toBe('+$0.00');
  });
  test('formatCorrelation', () => {
    expect(formatCorrelation(0.38211)).toBe('0.38');
    expect(formatCorrelation(-0.0026)).toBe('0.00');
    expect(formatCorrelation(-0.456)).toBe('\u22120.46');
  });
  test('formatDate', () => {
    const d = new Date(2026, 9, 26);
    expect(formatDate(d)).toBe('Oct 26');
    expect(formatDate(d, true)).toBe('Oct 26, 2026');
  });
});

describe('delta', () => {
  test('severity thresholds match the prototype', () => {
    expect(severityOf(0.99)).toBe('In step');
    expect(severityOf(-0.5)).toBe('In step');
    expect(severityOf(1)).toBe('Moderate lag');
    expect(severityOf(2.99)).toBe('Moderate lag');
    expect(severityOf(3)).toBe('Wide gap');
    expect(severityOf(-7.3)).toBe('Wide gap');
  });

  test('windowRange covers the trailing window and rejects short series', () => {
    expect(windowRange(449, 90)).toEqual({ start: 358, end: 448 });
    expect(() => windowRange(30, 30)).toThrow(RangeError);
  });

  test('computeDelta is basket change minus fuel change', () => {
    const fuel = [4, 4, 4, 3.6]; // −10%
    const basket = [100, 100, 100, 99]; // −1%
    const r = computeDelta(fuel, basket, 3);
    expect(r.fuelPct).toBeCloseTo(-10);
    expect(r.basketPct).toBeCloseTo(-1);
    expect(r.delta).toBeCloseTo(9);
    expect(r.severity).toBe('Wide gap');
  });

  test('verdict sentence copy', () => {
    expect(
      verdictSentence({ fuelPct: -4.24997, basketPct: -0.2546, delta: 3.9954 }, '90 days'),
    ).toBe(
      'Diesel fell 4.2% over 90 days. Your basket fell 0.3% over the same period, a gap of 4.0 percentage points.',
    );
    expect(verdictSentence({ fuelPct: 1.96, basketPct: 5.32, delta: 3.36 }, '12 months')).toBe(
      'Diesel rose 2.0% over 12 months. Your basket rose 5.3% over the same period, a gap of 3.4 percentage points.',
    );
  });

  test('window labels', () => {
    expect(windowInfo(365)).toEqual({ days: 365, short: '1Y', label: '12 months' });
  });
});

describe('stats', () => {
  test('pearson', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
  });

  test('bestLag finds the shift that aligns the series', () => {
    // Basket follows fuel exactly two weeks later.
    const fuel = Array.from({ length: 200 }, (_, i) => Math.sin(i / 9) + i * 0.001);
    const basket = fuel.map((_, i) => fuel[Math.max(0, i - 14)]!);
    const best = bestLag(fuel, basket, 100, 6);
    expect(best.weeks).toBe(2);
    expect(best.r).toBeCloseTo(1);
    expect(correlationAtLag(fuel, basket, 100, 2)).toBeCloseTo(1);
  });

  test('correlationAtLag rejects lags without enough history', () => {
    expect(() => correlationAtLag([1, 2, 3], [1, 2, 3], 1, 1)).toThrow(RangeError);
  });
});

describe('series', () => {
  test('indexWindow indexes both series to 100 and applies lag', () => {
    const fuel = [2, 4, 5, 6];
    const basket = [10, 20, 25, 30];
    expect(indexWindow(fuel, basket, 1, 3)).toEqual({
      fuel: [100, 125, 150],
      basket: [100, 125, 150],
    });
    expect(indexWindow(fuel, basket, 2, 3, 1).fuel).toEqual([100, 125]);
  });

  test('paddedRange and gridValues', () => {
    const { lo, hi } = paddedRange([95, 100], [97]);
    expect(lo).toBeCloseTo(93.9);
    expect(hi).toBeCloseTo(101.1);
    expect(gridValues(lo, hi)).toEqual([94, 96, 98, 100]);
    expect(gridValues(0, 20)).toEqual([0, 5, 10, 15, 20]);
    expect(gridValues(0.5, 3.2)).toEqual([1, 2, 3]);
  });

  test('nearestIndex and scaleLinear', () => {
    expect(nearestIndex(0.5, 91)).toBe(45);
    expect(nearestIndex(2, 91)).toBe(90);
    expect(scaleLinear(0, 10, 0, 100)(2.5)).toBe(25);
    expect(scaleLinear(5, 5, 0, 100)(5)).toBe(50);
  });

  test('sparkPath matches the prototype output', () => {
    expect(sparkPath([1, 2, 3, 2], 130, 40)).toBe('M0.0 38.0L43.3 20.0L86.7 2.0L130.0 20.0');
    expect(sparkPath([1], 10, 10)).toBe('');
  });
});

describe('basket', () => {
  test('baseline offsets', () => {
    expect(baselineIndex(449, '90D')).toBe(358);
    expect(baselineIndex(449, '6M')).toBe(266);
    expect(baselineIndex(449, '1Y')).toBe(84);
  });

  test('attribution splits the change', () => {
    const basket = [100, 105];
    const fuel = [4, 3]; // −25%
    const a = basketAttribution(basket, fuel, 0);
    expect(a.change).toBeCloseTo(5);
    expect(a.fuelAttributable).toBeCloseTo(-3); // 100 × 0.12 × −25%
    expect(a.noFuelLink).toBeCloseTo(8);
    expect(a.fuelShare + a.noFuelShare).toBeCloseTo(1);
    expect(a.noFuelShare).toBeCloseTo(8 / 11);
  });
});

describe('verdict', () => {
  test('explanations', () => {
    expect(verdictExplanation('gouge', -13.32)).toBe(
      'Price rose twice while diesel climbed. Diesel has since fallen 13.3% with no price reduction.',
    );
    expect(verdictExplanation('track', -5)).toBe(
      'Price rose with diesel and was reduced again as diesel fell.',
    );
  });
});
