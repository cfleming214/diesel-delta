import { pct, toISODate } from '@/domain';

import {
  CATALOG,
  CATEGORY_PASS_THROUGH,
  DEFAULT_BASKET_IDS,
  FUEL_FALLING_WEEKS,
  LEDGER_TEMPLATES,
  RETAILER_SCORES,
} from './fixtures/catalog';
import {
  BASKET,
  dateAt,
  FUEL,
  GAS,
  AREA_FIXTURE,
  REGION_ORDER,
  REGIONS,
  regionalize,
  START_DATE,
  weeklyFuel,
  YEAR_START,
} from './fixtures/series';
import { AREA_NAMES, PADD_AREA, type FuelArea } from './geo';
import { describeZip } from './geo/zip';
import type { CatalogItem, DataApi, ItemDetail, RegionKey } from './types';

const WEEKS = 52;
const priceSum = (ids: readonly string[]) =>
  CATALOG.filter((c) => ids.includes(c.id)).reduce((sum, c) => sum + c.price, 0);
const DEFAULT_BASKET_TOTAL = priceSum(DEFAULT_BASKET_IDS);

const publicRegion = (key: RegionKey) => ({ key, name: AREA_NAMES[PADD_AREA[key]] });

function fixtureFuel(area: FuelArea, kind: 'diesel' | 'gas') {
  const [key, factor] = AREA_FIXTURE[area];
  return regionalize(kind === 'diesel' ? FUEL : GAS, key).map((v) => v * factor);
}

function findItem(id: string): CatalogItem {
  const item = CATALOG.find((c) => c.id === id);
  if (!item) throw new Error(`Unknown item ${id}`);
  return item;
}

/** Builds the 12-month item model from its verdict's ledger template (prototype `itemModel`). */
export function buildItemDetail(item: CatalogItem, region: RegionKey): ItemDetail {
  const changes = LEDGER_TEMPLATES[item.verdict].map(([week, a, b, tag]) => ({
    week,
    from: item.price * a,
    to: item.price * b,
    tag,
  }));
  const basePrice = changes[0]!.from;
  const lastRise = changes.filter((c) => c.to > c.from).pop()!;

  const weeklyPrice: number[] = [];
  const weeklyFuelSeries: number[] = [];
  for (let w = 0; w <= WEEKS; w++) {
    let v = basePrice;
    for (const c of changes) if (w >= c.week) v = c.to;
    weeklyPrice.push(v);
    weeklyFuelSeries.push(weeklyFuel(w));
  }

  return {
    ...item,
    basePrice,
    unreturned: item.price - basePrice,
    changePct: pct(basePrice, item.price),
    fuelSincePct: pct(weeklyFuel(lastRise.week), weeklyFuel(WEEKS)),
    weeklyPrice,
    weeklyFuel: weeklyFuelSeries,
    changeWeeks: changes.map((c) => c.week),
    fuelFallingWeeks: FUEL_FALLING_WEEKS,
    ledger: changes
      .slice()
      .reverse()
      .map((c) => ({
        date: toISODate(dateAt(YEAR_START + c.week * 7)),
        from: c.from,
        to: c.to,
        fuelPrice: weeklyFuel(c.week) * REGIONS[region].level,
        tag: c.tag,
      })),
    spark: weeklyPrice.filter((_, w) => w % 4 === 0).concat([weeklyPrice[WEEKS]!]),
  };
}

/**
 * Synthetic barcodes for development only (not real product GTINs). Real scans resolve once the
 * catalog carries GTINs from retailer feeds.
 */
export const FIXTURE_BARCODES: Record<string, string> = {
  '0000000000017': 'ketchup',
  '0000000000024': 'milk',
  '0000000000031': 'eggs',
};

const LINK = /https?:|www\.|\.com/;

/** Word-AND match over name, size, category and store. Production uses Typesense fuzzy search. */
export function matchCatalog(query: string): { items: CatalogItem[]; resolvedFromLink: boolean } {
  const q = query.trim().toLowerCase();
  if (!q) return { items: [], resolvedFromLink: false };
  if (LINK.test(q))
    return { items: CATALOG.filter((c) => c.id === 'ketchup'), resolvedFromLink: true };
  const words = q.split(/\s+/);
  const items = CATALOG.filter((c) => {
    const hay = `${c.name} ${c.size} ${c.category} ${c.store}`.toLowerCase();
    const compact = hay.replace(/\s/g, '');
    return words.every((w) => hay.includes(w) || compact.includes(w));
  });
  return { items, resolvedFromLink: false };
}

export const fixtureApi: DataApi = {
  async lookupZip(zip) {
    const place = describeZip(zip);
    const series = fixtureFuel(place.dieselSeries.area, 'diesel');
    return {
      ...place,
      currentDiesel: series[series.length - 1]!,
      asOf: toISODate(dateAt(series.length - 1)),
    };
  },

  async getRegions() {
    return REGION_ORDER.map(publicRegion);
  },

  async getFuelSeries(area, kind) {
    return { startDate: START_DATE, values: fixtureFuel(area, kind) };
  },

  async getBasketSeries(itemIds) {
    const scale = priceSum(itemIds) / DEFAULT_BASKET_TOTAL;
    return { startDate: START_DATE, values: BASKET.map((v) => v * scale) };
  },

  async getCatalog() {
    return CATALOG;
  },

  async searchCatalog(query) {
    return matchCatalog(query);
  },

  async lookupBarcode(code) {
    const id = FIXTURE_BARCODES[code.replace(/\D/g, '')];
    return id ? findItem(id) : null;
  },

  async getItem(id, region) {
    return buildItemDetail(findItem(id), region);
  },

  async getProvenance(id, zip) {
    const item = findItem(id);
    return {
      source: `${item.store} listed price, ${item.name} ${item.size}`,
      captured: `Oct 28, 2026 at 04:12 CT · store ZIP ${zip}`,
      method: 'Retailer structured product feed (JSON-LD). HTML snapshot retained 90 days.',
      confidence: 'High. Matches 3 prior captures and 2 user receipts.',
    };
  },

  async getCategoryPassThrough() {
    return CATEGORY_PASS_THROUGH;
  },

  async getRetailerScores() {
    return RETAILER_SCORES;
  },
};
