// Item detail (ledger, unreturned amount, verdict, chart) built from the same simulated price
// history as Search and the product screen, so every screen shows the same numbers.
import { pct, ROLLBACK_DUE_PCT, toISODate, type LedgerTag, type Verdict } from '@/domain';

import { DAYS, FUEL, regionalize, TODAY } from './fixtures/series';
import { HISTORY_DAYS, productDetail } from './products';
import type { CatalogItem, ItemDetail, LedgerEntry, RegionKey } from './types';

const WEEKS = 52;
/** Moves under 3¢ or 0.5% are rounding or promo noise, not price changes. */
const MIN_MOVE_USD = 0.03;
const MIN_MOVE_PCT = 0.5;
/** Diesel must have risen at least this much in the 8 weeks before a rise to call it fuel-led. */
const FUEL_LED_PCT = 1;
const FUEL_LOOKBACK_DAYS = 56;

export type PriceStep = { day: number; from: number; to: number };

/** Discrete price changes in a daily series, ignoring moves under 3¢ or 0.5%. */
export function priceSteps(values: readonly number[]): PriceStep[] {
  const steps: PriceStep[] = [];
  let level = values[0]!;
  for (let day = 1; day < values.length; day++) {
    const v = values[day]!;
    if (Math.abs(v - level) >= MIN_MOVE_USD && Math.abs(pct(level, v)) >= MIN_MOVE_PCT) {
      steps.push({ day, from: level, to: v });
      level = v;
    }
  }
  return steps;
}

/** Diesel for each day of the price history (both end on the fixture "today"). */
function fuelForHistory(region: RegionKey): number[] {
  return regionalize(FUEL, region).slice(DAYS - HISTORY_DAYS);
}

const isRise = (s: PriceStep) => s.to > s.from;

/**
 * The price before the latest run of back-to-back rises among the steps before `day` (the level a
 * full rollback returns to), or null if there was no rise.
 */
export function runBase(steps: readonly PriceStep[], day = Infinity): number | null {
  const before = steps.filter((s) => s.day < day);
  let i = before.length - 1;
  while (i >= 0 && !isRise(before[i]!)) i--;
  if (i < 0) return null;
  while (i > 0 && isRise(before[i - 1]!)) i--;
  return before[i]!.from;
}

function tagFor(step: PriceStep, steps: readonly PriceStep[], fuel: readonly number[]): LedgerTag {
  if (isRise(step)) {
    const before = fuel[Math.max(0, step.day - FUEL_LOOKBACK_DAYS)]!;
    return pct(before, fuel[step.day]!) >= FUEL_LED_PCT ? 'Fuel-correlated' : 'No fuel link';
  }
  const base = runBase(steps, step.day);
  return base == null || step.to <= base ? 'Rollback' : 'Partial rollback';
}

/**
 * Gouge Gap: diesel fell since the last rise and the price hasn't come down at all.
 * Sticky Price: it came down only part of the way. Tracking Fuel: no rise, a full rollback, or
 * diesel hasn't fallen enough since the rise for a rollback to be due.
 */
export function classify(steps: readonly PriceStep[], now: number, fuelSincePct: number): Verdict {
  const lastRise = steps.filter(isRise).pop();
  if (!lastRise || fuelSincePct > ROLLBACK_DUE_PCT) return 'track';
  if (now >= lastRise.to) return 'gouge';
  return now > runBase(steps)! ? 'sticky' : 'track';
}

function model(id: string, region: RegionKey) {
  const cheapest = productDetail(id).retailers[0]!;
  const values = cheapest.history.values;
  const fuel = fuelForHistory(region);
  const steps = priceSteps(values);
  const end = values.length - 1;
  const lastRise = steps.filter(isRise).pop();
  const fuelSincePct = pct(fuel[lastRise?.day ?? 0]!, fuel[end]!);
  return { cheapest, values, fuel, steps, end, lastRise, fuelSincePct };
}

const verdicts = new Map<string, Verdict>();

/** An item's verdict against national diesel, for catalog lists (cached per item). */
export function verdictFor(id: string): Verdict {
  let v = verdicts.get(id);
  if (!v) {
    const m = model(id, 'nat');
    v = classify(m.steps, m.values[m.end]!, m.fuelSincePct);
    verdicts.set(id, v);
  }
  return v;
}

/** The 12-month item model for one region, from the cheapest retailer's daily prices. */
export function itemDetailFromHistory(item: CatalogItem, region: RegionKey): ItemDetail {
  const { cheapest, values, fuel, steps, end, fuelSincePct } = model(item.id, region);
  // Weekly points ending today: week 52 is the last day, week 0 is 364 days before it.
  const dayOfWeek = (w: number) => end - (WEEKS - w) * 7;
  const weekOfDay = (day: number) =>
    Math.min(WEEKS, Math.max(0, Math.round((day - (end - WEEKS * 7)) / 7)));
  const weeklyPrice = Array.from({ length: WEEKS + 1 }, (_, w) => values[dayOfWeek(w)]!);
  const weeklyFuel = Array.from({ length: WEEKS + 1 }, (_, w) => fuel[dayOfWeek(w)]!);
  const peakWeek = weeklyFuel.indexOf(Math.max(...weeklyFuel));
  const basePrice = values[0]!;
  const price = values[end]!;
  const verdict = classify(steps, price, fuelSincePct);
  const startDay = new Date(TODAY);
  startDay.setDate(startDay.getDate() - end);
  const dateOf = (day: number) => {
    const d = new Date(startDay);
    d.setDate(d.getDate() + day);
    return toISODate(d);
  };
  const ledger: LedgerEntry[] = steps
    .map((s) => ({
      date: dateOf(s.day),
      from: s.from,
      to: s.to,
      fuelPrice: fuel[s.day]!,
      tag: tagFor(s, steps, fuel),
    }))
    .reverse();

  return {
    ...item,
    store: cheapest.retailer,
    price,
    verdict,
    basePrice,
    // Only owed once a rollback is due: the part of the latest run of rises still in the price.
    unreturned: verdict === 'track' ? 0 : Math.max(0, price - runBase(steps)!),
    changePct: pct(basePrice, price),
    fuelSincePct,
    rises: steps.filter(isRise).length,
    weeklyPrice,
    weeklyFuel,
    changeWeeks: steps.map((s) => weekOfDay(s.day)),
    fuelFallingWeeks: [peakWeek, WEEKS],
    ledger,
    spark: weeklyPrice.filter((_, w) => w % 4 === 0).concat([weeklyPrice[WEEKS]!]),
  };
}
