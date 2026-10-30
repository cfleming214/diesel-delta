import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { loadCatalog } from './catalog';
import type { ObservationRow, StoreRow } from './db';
import { buildReport, daysBetween, renderReport, type ReportData } from './report';

const items = loadCatalog();
const days = daysBetween('2026-10-01', '2026-10-10');

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

/** Every default-basket item at $2 (Kroger, two stores) and $3 (Amazon); milk at Kroger rises on day 6. */
function data(): ReportData {
  const observations: ObservationRow[] = [];
  for (const day of days) {
    for (const item of items.filter((i) => i.inDefaultBasket)) {
      const k = item.id === 'milk' && day >= '2026-10-06' ? 2.5 : 2;
      observations.push(
        obs({ item_id: item.id, retailer_id: 'kroger', store_id: 1, day, regular_price: k }),
      );
      observations.push(
        obs({ item_id: item.id, retailer_id: 'kroger', store_id: 2, day, regular_price: k + 0.2 }),
      );
      observations.push(obs({ item_id: item.id, retailer_id: 'amazon', day, regular_price: 3 }));
    }
  }
  return {
    from: days[0]!,
    to: days[days.length - 1]!,
    items,
    observations,
    stores,
    events: [
      {
        item_id: 'chips',
        retailer_id: 'kroger',
        region: 'gulf',
        day: '2026-10-04',
        from_price: 4.09,
        to_price: 4.09,
        kind: 'size_change',
        tag: '8 oz → 7.5 oz',
      },
      {
        item_id: 'chips',
        retailer_id: 'kroger',
        region: 'west',
        day: '2026-10-04',
        from_price: 4.29,
        to_price: 4.29,
        kind: 'size_change',
        tag: '8 oz → 7.5 oz',
      },
    ],
    reviews: [{ reason: 'out_of_band', day: '2026-10-03', retailer_id: 'kroger' }],
    runs: days.map((day, i) => ({
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
    diesel: days.map((day, i) => ({ day, price: 3.5 + i * 0.01 })),
    generatedAt: '2026-10-11T00:00:00Z',
  };
}

describe('report', () => {
  const m = buildReport(data());

  test('basket uses store medians and indexes to the first day', () => {
    assert.deepEqual(m.retailerIds, ['kroger', 'amazon']);
    const kroger = m.basketSeries.find((s) => s.retailer === 'kroger')!;
    const n = m.basketItems.length;
    assert.equal(n, 16);
    // Median of $2.00 and $2.20 is $2.10 per item.
    assert.ok(Math.abs(kroger.cost[0]! - 2.1 * n) < 1e-9);
    assert.equal(kroger.index[0], 100);
    // Milk +$0.50 from day 6.
    assert.ok(Math.abs(kroger.cost[9]! - (2.1 * n + 0.5)) < 1e-9);
    const amazon = m.basketSeries.find((s) => s.retailer === 'amazon')!;
    assert.ok(amazon.index.every((v) => v === 100));
  });

  test('counts store-level changes, movers, shrinks, coverage and diesel', () => {
    assert.equal(m.totals.increases, 2, 'milk rose at both Kroger stores');
    assert.equal(m.totals.decreases, 0);
    assert.equal(m.topUp[0]?.item.id, 'milk');
    assert.ok(Math.abs(m.topUp[0]!.pct - (2.6 / 2.1 - 1) * 100) < 1e-9);
    assert.equal(m.shrinks.length, 1, 'one product, two regions');
    assert.deepEqual(m.shrinks[0]!.regions, ['gulf', 'west']);
    assert.equal(m.totals.avgCoverage, 90);
    assert.equal(m.totals.daysMissing, 0);
    assert.ok(m.diesel && Math.abs(m.diesel.pct - (3.59 / 3.5 - 1) * 100) < 1e-9);
    assert.equal(m.simulated, true);
  });

  test('regional basket uses only that region’s stores', () => {
    const gulf = m.regions
      .find((r) => r.padd === 'gulf')!
      .values.find((v) => v.retailer === 'kroger')!;
    const west = m.regions
      .find((r) => r.padd === 'west')!
      .values.find((v) => v.retailer === 'kroger')!;
    assert.ok(Math.abs(gulf.cost! - (2 * 16 + 0.5)) < 1e-9);
    assert.ok(Math.abs(west.cost! - (2.2 * 16 + 0.5)) < 1e-9);
  });

  test('marks every retailer tied for cheapest', () => {
    const d = data();
    d.observations = d.observations.map((o) =>
      o.item_id === 'eggs' ? { ...o, regular_price: 3 } : o,
    );
    const eggs = buildReport(d).priceTable.find((r) => r.item.id === 'eggs')!;
    assert.deepEqual(eggs.cheapest, ['kroger', 'amazon']);
  });

  test('renders a complete page with the simulated-data banner and no gaps', () => {
    const html = renderReport(m);
    assert.match(html, /<title>DieselDelta Price Report<\/title>/);
    assert.match(html, /Simulated data\./);
    assert.match(html, /8 oz → 7\.5 oz/);
    assert.doesNotMatch(html, /NaN|undefined|Infinity/);
    assert.equal(
      (html.match(/<svg viewBox/g) ?? []).length,
      3,
      'basket, region and category charts',
    );
  });

  test('real sources get no banner', () => {
    const d = data();
    d.sources = d.sources.map((s) => ({ ...s, kind: 'api' as const }));
    assert.doesNotMatch(renderReport(buildReport(d)), /Simulated data\./);
  });
});
