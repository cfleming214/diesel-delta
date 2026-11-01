import { toISODate } from '@/domain';

import { CATEGORY_PASS_THROUGH, RETAILER_SCORES } from './fixtures/catalog';
import {
  BASKET,
  dateAt,
  FUEL,
  GAS,
  AREA_FIXTURE,
  REGION_ORDER,
  regionalize,
  START_DATE,
} from './fixtures/series';
import { AREA_NAMES, PADD_AREA, type FuelArea } from './geo';
import { describeZip } from './geo/zip';
import { itemDetailFromHistory, verdictFor } from './itemHistory';
import { basketCostSeries, isProduct, productDetail, productSummaries } from './products';
import type { CatalogItem, DataApi, RegionKey } from './types';

/**
 * Every catalog product priced at its cheapest retailer, so Search, the product screen, the
 * basket and item detail agree. Verdicts come from each item's own price history, which is costly
 * to build, so `catalogItem` adds them only for the items a caller returns.
 */
const PRODUCTS = productSummaries();

const catalogItem = (id: string): CatalogItem => {
  const p = PRODUCTS.find((c) => c.id === id);
  if (!p) throw new Error(`Unknown item ${id}`);
  const { name, size, category, retailer: store, price } = p;
  return { id, name, size, category, store, price, verdict: verdictFor(id) };
};

const publicRegion = (key: RegionKey) => ({ key, name: AREA_NAMES[PADD_AREA[key]] });

function fixtureFuel(area: FuelArea, kind: 'diesel' | 'gas') {
  const [key, factor] = AREA_FIXTURE[area];
  return regionalize(kind === 'diesel' ? FUEL : GAS, key).map((v) => v * factor);
}

const findItem = catalogItem;

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
  if (LINK.test(q)) return { items: [catalogItem('ketchup')], resolvedFromLink: true };
  const words = q.split(/\s+/);
  const matches = PRODUCTS.filter((c) => {
    const hay = `${c.name} ${c.size} ${c.category} ${c.retailer}`.toLowerCase();
    const compact = hay.replace(/\s/g, '');
    return words.every((w) => hay.includes(w) || compact.includes(w));
  });
  return { items: matches.map((c) => catalogItem(c.id)), resolvedFromLink: false };
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

  /** The basket's cost from the same product prices as Search and the basket card. */
  async getBasketSeries(itemIds) {
    return { startDate: START_DATE, values: basketCostSeries(itemIds, BASKET.length) };
  },

  async getCatalog() {
    return PRODUCTS.map((p) => catalogItem(p.id));
  },

  async searchCatalog(query) {
    return matchCatalog(query);
  },

  async lookupBarcode(code) {
    const id = FIXTURE_BARCODES[code.replace(/\D/g, '')];
    return id ? findItem(id) : null;
  },

  async getItem(id, region) {
    return itemDetailFromHistory(findItem(id), region);
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

  async getProducts() {
    return productSummaries();
  },

  async getProduct(id) {
    if (!isProduct(id)) throw new Error(`Unknown product ${id}`);
    return productDetail(id);
  },
};
