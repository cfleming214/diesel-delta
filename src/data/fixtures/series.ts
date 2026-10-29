// Ported from the prototype (design/handoff/DieselDeltaApp.dc.html). Invented but realistic data.
import { toISODate } from '@/domain';

import type { FuelArea } from '../geo';
import type { RegionKey } from '../types';

/** Days of history: 12 months plus 12 weeks of lead-in for lag tests. */
export const DAYS = 449;
/** Index of the first day of the trailing 12 months. */
export const YEAR_START = DAYS - 365;
/** The fixture "today". */
export const TODAY = new Date(2026, 9, 26);

export const dateAt = (i: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - (DAYS - 1 - i));
  return d;
};

export const START_DATE = toISODate(dateAt(0));

type Key = [week: number, value: number];

/** Smoothstep interpolation between weekly keyframes. */
function interp(keys: Key[], w: number): number {
  for (let k = 0; k < keys.length - 1; k++) {
    const [a, va] = keys[k]!;
    const [b, vb] = keys[k + 1]!;
    if (w >= a && w <= b) {
      const t = (w - a) / (b - a);
      const s = t * t * (3 - 2 * t);
      return va + (vb - va) * s;
    }
  }
  return keys[w < keys[0]![0] ? 0 : keys.length - 1]![1];
}

const FUEL_KEYS: Key[] = [
  [-12, 3.49],
  [0, 3.52],
  [8, 3.61],
  [16, 3.88],
  [22, 3.97],
  [30, 3.78],
  [38, 3.58],
  [46, 3.46],
  [52, 3.41],
];
const BASKET_KEYS: Key[] = [
  [-12, 96.1],
  [0, 96.4],
  [10, 97.1],
  [20, 100.2],
  [26, 101.85],
  [34, 101.95],
  [42, 101.7],
  [52, 101.52],
];

export const FUEL: number[] = [];
export const GAS: number[] = [];
/** Default 16-item basket value in dollars. */
export const BASKET: number[] = [];
for (let i = 0; i < DAYS; i++) {
  const w = (i - YEAR_START) / 7;
  FUEL.push(interp(FUEL_KEYS, w) + Math.sin(i * 0.41) * 0.012 + Math.sin(i * 0.13) * 0.018);
  GAS.push(interp(FUEL_KEYS, w) * 0.86 + 0.08 + Math.sin(i * 0.29) * 0.02);
  BASKET.push(interp(BASKET_KEYS, Math.floor(w)));
}

/** Price level and volatility of each region relative to the national-shape fixture series. */
export const REGIONS: Record<RegionKey, { level: number; amp: number }> = {
  gulf: { level: 1.0, amp: 1.0 },
  east: { level: 1.07, amp: 0.9 },
  mid: { level: 1.04, amp: 1.1 },
  rocky: { level: 1.09, amp: 0.8 },
  west: { level: 1.27, amp: 0.7 },
  nat: { level: 1.06, amp: 0.95 },
};

/** Region order used by the Insights table. */
export const REGION_ORDER: RegionKey[] = ['gulf', 'east', 'mid', 'rocky', 'west', 'nat'];

/** Fixture stand-in for each EIA area: its region's series times a small level offset. */
export const AREA_FIXTURE: Record<FuelArea, [RegionKey, number]> = {
  NUS: ['nat', 1],
  R10: ['east', 1],
  R1X: ['east', 1.02],
  R1Y: ['east', 1.0],
  R1Z: ['east', 0.975],
  R20: ['mid', 1],
  R30: ['gulf', 1],
  R40: ['rocky', 1],
  R50: ['west', 1],
  R5XCA: ['west', 0.94],
  SCA: ['west', 1.04],
  SCO: ['rocky', 0.985],
  SFL: ['east', 0.985],
  SMA: ['east', 1.01],
  SMN: ['mid', 0.985],
  SNY: ['east', 1.02],
  SOH: ['mid', 0.98],
  STX: ['gulf', 0.985],
  SWA: ['west', 1.02],
};

const MEAN = 3.65;

/** Re-bases a national-shape series onto a region's price level and volatility. */
export const regionalize = (base: readonly number[], key: RegionKey) => {
  const r = REGIONS[key];
  return base.map((v) => (MEAN + (v - MEAN) * r.amp) * r.level);
};

/** Fuel price for week `w` of the trailing year (unregionalized, as the prototype's ledger uses). */
export const weeklyFuel = (w: number) => FUEL[YEAR_START + w * 7]!;
