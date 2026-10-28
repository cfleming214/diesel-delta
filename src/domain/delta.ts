import { pct } from './format';

export const WINDOWS = [
  { days: 30, short: '30D', label: '30 days' },
  { days: 60, short: '60D', label: '60 days' },
  { days: 90, short: '90D', label: '90 days' },
  { days: 365, short: '1Y', label: '12 months' },
] as const;

export type WindowDays = (typeof WINDOWS)[number]['days'];

export const DEFAULT_WINDOW: WindowDays = 90;

export const windowInfo = (days: WindowDays) => WINDOWS.find((w) => w.days === days)!;

export type Severity = 'In step' | 'Moderate lag' | 'Wide gap';

/** Under 1 pt → In step; under 3 → Moderate lag; otherwise Wide gap (prototype thresholds). */
export function severityOf(gapPts: number): Severity {
  const g = Math.abs(gapPts);
  return g < 1 ? 'In step' : g < 3 ? 'Moderate lag' : 'Wide gap';
}

/** Index range covering the last `days` days of a daily series of `length` points. */
export function windowRange(length: number, days: number) {
  const end = length - 1;
  const start = end - days;
  if (start < 0) throw new RangeError(`Series of ${length} days cannot cover a ${days}-day window`);
  return { start, end };
}

export type DeltaResult = {
  fuelPct: number;
  basketPct: number;
  /** Basket change minus fuel change, in percentage points. */
  delta: number;
  severity: Severity;
};

/** The headline Delta over the trailing window of two aligned daily series. */
export function computeDelta(fuel: number[], basket: number[], days: number): DeltaResult {
  if (fuel.length !== basket.length) throw new RangeError('Series must be aligned');
  const { start, end } = windowRange(fuel.length, days);
  const fuelPct = pct(fuel[start]!, fuel[end]!);
  const basketPct = pct(basket[start]!, basket[end]!);
  const delta = basketPct - fuelPct;
  return { fuelPct, basketPct, delta, severity: severityOf(delta) };
}

const moved = (v: number) => `${v < 0 ? 'fell' : 'rose'} ${Math.abs(v).toFixed(1)}%`;

/**
 * Neutral verdict copy: "Diesel fell 4.2% over 90 days. Your basket fell 0.3% over the same
 * period, a gap of 4.0 percentage points."
 */
export function verdictSentence(
  { fuelPct, basketPct, delta }: Pick<DeltaResult, 'fuelPct' | 'basketPct' | 'delta'>,
  windowLabel: string,
  seriesName = 'Diesel',
) {
  return (
    `${seriesName} ${moved(fuelPct)} over ${windowLabel}. ` +
    `Your basket ${moved(basketPct)} over the same period, ` +
    `a gap of ${Math.abs(delta).toFixed(1)} percentage points.`
  );
}
