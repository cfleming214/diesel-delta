import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { loadCatalog } from './catalog';
import type { ObservationRow, StoreRow } from './db';
import {
  addDays,
  type BasketDay,
  buildReport,
  daysBetween,
  type PricePoint,
  renderReport,
  type ReportData,
} from './report';

const items = loadCatalog();
const basket = items.filter((i) => i.inDefaultBasket).map((i) => i.id);
const n = basket.length;
const TO = '2026-10-30';
const D30 = addDays(TO, -30);
const Y1 = addDays(TO, -365);
const close = (a: number | null | undefined, b: number) =>
  assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

const stores: StoreRow[] = [
  {
    id: 1,
    retailer_id: 'kroger',
    external_id: 'a',
    name: 'A',
    zip: '77002',
    state: 'TX',
    padd: 'gulf',
    active: true,
  },
  {
    id: 2,
    retailer_id: 'kroger',
    external_id: 'b',
    name: 'B',
    zip: '90012',
    state: 'CA',
    padd: 'west',
    active: true,
  },
];

function obs(
  o: Partial<ObservationRow> &
    Pick<ObservationRow, 'item_id' | 'retailer_id' | 'day' | 'regular_price'>,
): ObservationRow {
  return {
    store_id: null,
    source_id: `mock-${o.retailer_id}`,
    run_id: 1,
    captured_at: `${o.day}T06:00:00Z`,
    promo_price: null,
    member_price: null,
    size_qty: 1,
    size_unit: 'gal',
    unit_price: 0.001,
    in_stock: true,
    retailer_sku: 'x',
    match_confidence: 1,
    raw_ref: null,
    ...o,
  };
}

const points = (price: (item: string, retailer: string) => number): PricePoint[] =>
  basket.flatMap((item_id) =>
    ['kroger', 'amazon'].map((retailer_id) => ({
      item_id,
      retailer_id,
      price: price(item_id, retailer_id),
    })),
  );

/**
 * Kroger: every basket item $2.00 a year ago, $2.10 thirty days ago, and $2.10 today except milk at
 * $2.60. Amazon: $2.50 a year ago, $3.00 since thirty days ago.
 */
function data(): ReportData {
  const window = daysBetween(addDays(TO, -29), TO);
  const observations: ObservationRow[] = [];
  for (const day of window) {
    for (const item of basket) {
      const k = item === 'milk' && day >= addDays(TO, -24) ? 2.5 : 2;
      observations.push(
        obs({ item_id: item, retailer_id: 'kroger', store_id: 1, day, regular_price: k }),
      );
      observations.push(
        obs({ item_id: item, retailer_id: 'kroger', store_id: 2, day, regular_price: k + 0.2 }),
      );
      observations.push(obs({ item_id: item, retailer_id: 'amazon', day, regular_price: 3 }));
    }
  }
  const year = daysBetween(Y1, TO);
  const kroger: BasketDay[] = year.map((day) => ({
    day,
    cost: day < D30 ? n * 2 : day < addDays(TO, -24) ? n * 2.1 : n * 2.1 + 0.5,
    items: n,
  }));
  const amazon: BasketDay[] = year.map((day) => ({
    day,
    cost: day < D30 ? n * 2.5 : n * 3,
    items: n,
  }));
  // One incomplete day leaves a gap instead of a wrong total.
  amazon[100] = { ...amazon[100]!, cost: 1, items: n - 1 };

  return {
    to: TO,
    items,
    observations,
    stores,
    events: [
      {
        item_id: 'chips',
        retailer_id: 'kroger',
        region: 'west',
        day: '2026-06-05',
        from_price: 4.29,
        to_price: 4.29,
        kind: 'size_change',
        tag: '8 oz → 7.5 oz',
      },
      {
        item_id: 'chips',
        retailer_id: 'kroger',
        region: 'gulf',
        day: '2026-06-04',
        from_price: 4.09,
        to_price: 4.09,
        kind: 'size_change',
        tag: '8 oz → 7.5 oz',
      },
    ],
    reviews: [{ reason: 'out_of_band', day: addDays(TO, -3), retailer_id: 'kroger' }],
    runs: year.map((day, i) => ({
      id: i + 1,
      status: 'succeeded',
      detail: {
        day,
        coverage: { pct: 90 },
        sources: { 'mock-kroger': { tasks: 2, failedTasks: 0, published: 32, held: 0 } },
      },
    })),
    sources: [
      {
        id: 'mock-kroger',
        retailer_id: 'kroger',
        kind: 'mock',
        scope: 'store',
        enabled: true,
        legal_approved_at: null,
      },
      {
        id: 'mock-amazon',
        retailer_id: 'amazon',
        kind: 'mock',
        scope: 'online',
        enabled: true,
        legal_approved_at: null,
      },
    ],
    diesel: daysBetween(addDays(Y1, -10), TO).map((day) => ({
      day,
      price: day < Y1 ? 3.4 : day < D30 ? 3.5 : 3.6,
    })),
    prices: {
      end: {
        target: TO,
        day: TO,
        prices: points((i, r) => (r === 'amazon' ? 3 : i === 'milk' ? 2.6 : 2.1)),
      },
      d30: { target: D30, day: D30, prices: points((_, r) => (r === 'amazon' ? 3 : 2.1)) },
      y1: { target: Y1, day: Y1, prices: points((_, r) => (r === 'amazon' ? 2.5 : 2)) },
    },
    basket: { items: basket, byRetailer: { kroger, amazon } },
    generatedAt: '2026-10-31T00:00:00Z',
  };
}

describe('report', () => {
  const m = buildReport(data());
  const series = (r: string) => m.basketSeries.find((s) => s.retailer === r)!;

  test('basket: now, 30 days and 1 year, with a gap for an incomplete day', () => {
    assert.deepEqual(m.retailerIds, ['kroger', 'amazon']);
    assert.equal(m.basketItems.length, 16);
    const k = series('kroger');
    close(k.now, n * 2.1 + 0.5);
    close(k.cost30, n * 2.1);
    close(k.cost1y, n * 2);
    close(k.pct30, ((n * 2.1 + 0.5) / (n * 2.1) - 1) * 100);
    close(k.pct1y, ((n * 2.1 + 0.5) / (n * 2) - 1) * 100);
    close(series('amazon').pct1y, 20);
    assert.equal(series('amazon').year.cost[100], null);
    assert.equal(k.year.index[0], 100);
    assert.equal(k.window.index[0], 100, 'the 30-day chart is indexed to its own first day');
    assert.equal(m.yearDays.length, 366);
    assert.equal(m.days30.length, 30);
  });

  test('item changes, movers and categories for both horizons', () => {
    const milk = m.priceTable.find((r) => r.item.id === 'milk')!;
    // Kroger +23.8% / +30%, Amazon 0% / +20%: averages across retailers.
    close(milk.pct30, ((2.6 / 2.1 - 1) * 100 + 0) / 2);
    close(milk.pct1y, ((2.6 / 2 - 1) * 100 + 20) / 2);
    assert.equal(m.movers30.up[0]?.item.id, 'milk');
    assert.equal(m.movers30.up.length, 1, 'only milk moved in 30 days');
    assert.equal(m.movers1y.up.length, 10);
    assert.equal(m.movers1y.down.length, 0);
    const dairy = m.categories.find((c) => c.category === 'Dairy')!;
    assert.ok(dairy.pct1y !== null && dairy.pct30 !== null && dairy.n1y > 0);
  });

  test('store-level detail, shrinks, runs and diesel', () => {
    assert.equal(m.totals.increases, 2, 'milk rose at both Kroger stores');
    assert.equal(m.shrinks.length, 1);
    assert.equal(m.shrinks[0]!.day, '2026-06-04', 'first seen is the earliest region');
    assert.equal(m.year.daysRun, 366);
    assert.equal(m.firstDay, Y1);
    close(m.diesel?.pct30 ?? null, 0); // $3.60 since 30 days ago
    close(m.diesel?.pct1y ?? null, (3.6 / 3.5 - 1) * 100);
    const gulf = m.regions.find((r) => r.padd === 'gulf')!.values[0]!;
    close(gulf.cost, 2 * 16 + 0.5);
  });

  test('without a year of history, 1-year figures are empty and the report says why', () => {
    const d = data();
    d.prices.y1 = { target: Y1, day: null, prices: [] };
    d.basket.byRetailer = Object.fromEntries(
      Object.entries(d.basket.byRetailer).map(([r, days]) => [
        r,
        days.filter((b) => b.day >= '2026-06-01'),
      ]),
    );
    d.runs = d.runs.filter((r) => String(r.detail?.day) >= '2026-06-01');
    const short = buildReport(d);
    assert.equal(short.basketSeries[0]!.pct1y, null);
    assert.ok(short.priceTable.every((r) => r.pct1y === null));
    const html = renderReport(short);
    assert.match(html, /1-year changes need prices from October 30, 2025/);
    assert.match(html, /No 1-year history yet\./);
  });

  test('marks every retailer tied for cheapest', () => {
    const d = data();
    d.prices.end.prices = d.prices.end.prices.map((p) =>
      p.item_id === 'eggs' ? { ...p, price: 3 } : p,
    );
    const eggs = buildReport(d).priceTable.find((r) => r.item.id === 'eggs')!;
    assert.deepEqual(eggs.cheapest, ['kroger', 'amazon']);
  });

  test('renders both horizons with the simulated-data banner and no gaps', () => {
    const html = renderReport(m);
    assert.match(html, /<title>Diesel Data Price Report<\/title>/);
    assert.match(html, /Simulated data\./);
    assert.match(html, /30-day change<\/th>/);
    assert.match(html, /Basket cost, daily<\/h3>/);
    assert.match(html, /1-year change<\/th>/);
    assert.match(html, /No item fell over the year\./);
    assert.match(html, /8 oz → 7\.5 oz/);
    assert.doesNotMatch(html, /NaN|undefined|Infinity/);
    assert.equal(
      (html.match(/<svg viewBox/g) ?? []).length,
      5,
      'two baskets, regions, two category charts',
    );
  });

  test('real sources get no banner', () => {
    const d = data();
    d.sources = d.sources.map((s) => ({ ...s, kind: 'api' as const }));
    assert.doesNotMatch(renderReport(buildReport(d)), /Simulated data\./);
  });
});
