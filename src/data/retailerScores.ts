// The retailer scorecard, computed from each retailer's own price history for the tracked catalog
// (the same simulated prices Search and the product screen show).
import { fuelForHistory, isFuelLedRise, priceSteps } from './itemHistory';
import { productDetail, productSummaries } from './products';
import type { RetailerScore, Store } from './types';

/** Categories need this many fuel-led rises before their share is shown. */
const MIN_CATEGORY_RISES = 3;

/**
 * A letter grade for a rollback share: A from 80%, B from 65%, C from 50%, D from 35%, F below.
 * The top third of a band adds +, the bottom third −.
 */
export function gradeFor(pct: number): string {
  const bands: [number, string][] = [
    [80, 'A'],
    [65, 'B'],
    [50, 'C'],
    [35, 'D'],
  ];
  for (const [floor, letter] of bands) {
    if (pct < floor) continue;
    if (letter === 'A') return pct >= 95 ? 'A+' : pct < 85 ? 'A−' : 'A';
    const into = pct - floor;
    return into >= 10 ? `${letter}+` : into < 5 ? `${letter}−` : letter;
  }
  return 'F';
}

type Tally = { rises: number; rolledBack: number };

/**
 * For each retailer: how many products it carries, and the share of its fuel-led price rises
 * (diesel up at least 1% in the 8 weeks before) that a later cut fully reversed. Judged against
 * national diesel.
 */
export function retailerScores(): RetailerScore[] {
  const fuel = fuelForHistory('nat');
  const byRetailer = new Map<Store, { items: number; all: Tally; cats: Map<string, Tally> }>();

  for (const p of productSummaries()) {
    for (const r of productDetail(p.id).retailers) {
      const entry = byRetailer.get(r.retailer) ?? { items: 0, all: tally(), cats: new Map() };
      byRetailer.set(r.retailer, entry);
      entry.items++;
      const cat = entry.cats.get(p.category) ?? tally();
      entry.cats.set(p.category, cat);
      const steps = priceSteps(r.history.values);
      for (const rise of steps.filter((s) => isFuelLedRise(s, fuel))) {
        const reversed = steps.some((s) => s.day > rise.day && s.to <= rise.from);
        for (const t of [entry.all, cat]) {
          t.rises++;
          if (reversed) t.rolledBack++;
        }
      }
    }
  }

  return [...byRetailer].map(([name, { items, all, cats }]) => {
    const rollbackPct = share(all);
    return {
      name,
      grade: gradeFor(rollbackPct),
      rollbackPct,
      itemsTracked: items,
      categories: [...cats]
        .filter(([, t]) => t.rises >= MIN_CATEGORY_RISES)
        .map(([category, t]) => ({ category, pct: share(t) }))
        .sort((a, b) => b.pct - a.pct),
    };
  });
}

const tally = (): Tally => ({ rises: 0, rolledBack: 0 });
const share = (t: Tally) => (t.rises ? Math.round((t.rolledBack / t.rises) * 100) : 0);
