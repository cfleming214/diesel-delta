import { pct } from './format';

/** The same 30D, 90D and 1Y ranges as the rest of the app. */
export const BASELINES = ['30D', '90D', '1Y'] as const;
export type Baseline = (typeof BASELINES)[number];
export const DEFAULT_BASELINE: Baseline = '1Y';

/** Days back from the latest point for each baseline (as the products' 30D/90D/1Y changes). */
const BASELINE_DAYS: Record<Baseline, number> = { '30D': 30, '90D': 90, '1Y': 365 };

export const baselineIndex = (length: number, baseline: Baseline) =>
  length - 1 - BASELINE_DAYS[baseline];

/**
 * Placeholder share of basket cost that moves with fuel. Production replaces this with
 * per-item regression coefficients from the verdict engine.
 */
export const FUEL_SENSITIVITY = 0.12;

export type BasketAttribution = {
  from: number;
  to: number;
  change: number;
  fuelAttributable: number;
  noFuelLink: number;
  /** Shares of the split bar (0..1), by absolute size. */
  fuelShare: number;
  noFuelShare: number;
};

/** Splits the basket's dollar change since the baseline into fuel-attributable and the rest. */
export function basketAttribution(
  basket: readonly number[],
  fuel: readonly number[],
  start: number,
  end = basket.length - 1,
  sensitivity = FUEL_SENSITIVITY,
): BasketAttribution {
  const from = basket[start]!;
  const to = basket[end]!;
  const change = to - from;
  const fuelAttributable = (from * sensitivity * pct(fuel[start]!, fuel[end]!)) / 100;
  const noFuelLink = change - fuelAttributable;
  const total = Math.abs(fuelAttributable) + Math.abs(noFuelLink) || 1;
  return {
    from,
    to,
    change,
    fuelAttributable,
    noFuelLink,
    fuelShare: Math.abs(fuelAttributable) / total,
    noFuelShare: Math.abs(noFuelLink) / total,
  };
}
