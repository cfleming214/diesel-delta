import { describe, expect, test } from '@jest/globals';

import { api } from '@/data';
import { itemChartGeometry, lagChartGeometry, nearestIndex } from '@/domain';
import { BASKET, DAYS, FUEL } from '@/data/fixtures/series';

// Golden values from the prototype's `lineModel` for ZIP 77002 (Gulf Coast, 90-day window).
describe('lagChartGeometry', () => {
  test('Today chart (362×230, no lag)', () => {
    const g = lagChartGeometry({
      fuel: FUEL,
      basket: BASKET,
      start: DAYS - 91,
      end: DAYS - 1,
      width: 362,
      height: 230,
    });
    expect(g.count).toBe(91);
    expect(
      g.fuelPath.startsWith('M0.0 34.9L4.0 41.4L8.0 49.0L12.1 56.9L16.1 64.4L20.1 70.8L24'),
    ).toBe(true);
    expect(g.fuelPath).toHaveLength(1047);
    expect(g.basketPath.startsWith('M0.0 34.9L4.0 34.9L8.0 34.9')).toBe(true);
    expect(g.basketPath).toHaveLength(973);
    expect(g.gapPath.endsWith('.4L12.1 56.9L8.0 49.0L4.0 41.4L0.0 34.9Z')).toBe(true);
    expect(g.gapPath).toHaveLength(2021);
    expect(g.grid.map((l) => l.label)).toEqual(['94', '96', '98', '100']);
    expect(g.grid[0]!.y).toBeCloseTo(222.86362815923616, 8);
    expect(g.xs.at(-1)).toBe(362);
    expect(g.fuelYs.at(-1)).toBeCloseTo(168.0372098282592, 8);
    expect(g.basketYs.at(-1)).toBeCloseTo(42.86611364187564, 8);
  });

  test('Chart explorer (334×250, two-week lag, scrubbed to the middle)', () => {
    const g = lagChartGeometry({
      fuel: FUEL,
      basket: BASKET,
      start: DAYS - 91,
      end: DAYS - 1,
      lagDays: 14,
      width: 334,
      height: 250,
    });
    expect(g.fuelPath.startsWith('M0.0 37.4L3.7 42.1L7.4 46.5L11.1 50.0L14.8 52.0')).toBe(true);
    expect(g.fuelPath).toHaveLength(1033);
    const k = nearestIndex(0.5, g.count);
    expect(g.xs[k]).toBe(167);
    expect(g.fuelYs[k]).toBeCloseTo(130.21878954368987, 8);
    expect(g.basketYs[k]).toBeCloseTo(41.213551115140405, 8);
  });
});

// Golden values from the prototype's `itemModel` chart for Whole milk (362×170).
describe('itemChartGeometry', () => {
  test('milk', async () => {
    const milk = await api.getItem('milk', 'gulf');
    const g = itemChartGeometry({ ...milk, width: 362, height: 170 });
    expect(g.fuelPath.startsWith('M0.0 133.7L7.0 132.7L13.9 122.9L20.9 120.2L27.8 11')).toBe(true);
    expect(g.fuelPath).toHaveLength(594);
    expect(g.pricePath.startsWith('M0 158.0L7.0 158.0L7.0 158.0')).toBe(true);
    expect(g.band.x).toBeCloseTo(153.15384615384616, 8);
    expect(g.band.width).toBeCloseTo(208.84615384615384, 8);
    expect(g.marks.map((m) => [m.x, m.y])).toEqual([
      [104.42307692307692, 85],
      [160.1153846153846, 12],
    ]);
    expect(g.price.hi.toFixed(2)).toBe('3.89');
    expect(g.price.lo.toFixed(2)).toBe('3.42');
    expect(g.fuel.hi.toFixed(2)).toBe('3.97');
    expect(g.fuel.lo.toFixed(2)).toBe('3.41');
  });
});
