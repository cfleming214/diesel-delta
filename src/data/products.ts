// Fixture products: the price bot's 150-item catalog, priced at Kroger, Walmart and Amazon by the
// shared deterministic simulation (fixtures/priceSim.ts). Generated data for development: the live
// source replaces it once the bot collects real prices.
import { toISODate, type Verdict } from '@/domain';

import { PRODUCT_SEEDS } from './fixtures/products.gen';
import {
  dayNumber,
  isCarried,
  rand,
  RETAILER_FACTOR,
  shelf,
  SIM_RETAILERS,
  stepFactor,
  type SimRetailer,
} from './fixtures/priceSim';
import { TODAY } from './fixtures/series';
import type {
  PriceChange,
  ProductDetail,
  ProductSummary,
  RetailerPriceHistory,
  Store,
} from './types';

/** [id, name, size label, category, reference price, in default basket]. */
export type ProductSeed = [
  id: string,
  name: string,
  size: string,
  category: string,
  refPrice: number,
  inDefaultBasket: 0 | 1,
];

/** Days of daily history each retailer series carries (a year, plus today). */
export const HISTORY_DAYS = 366;
export const PRODUCTS_AS_OF = toISODate(TODAY);

const STORE: Record<SimRetailer, Store> = {
  kroger: 'Kroger',
  walmart: 'Walmart',
  amazon: 'Amazon',
};
const HORIZONS = { d30: 30, d90: 90, d365: 365 } as const;
const seeds = new Map(PRODUCT_SEEDS.map((s) => [s[0], s]));

function nationalPrice(seed: ProductSeed, r: SimRetailer, day: number) {
  const [id, , , , ref] = seed;
  const noise = 0.92 + rand(`${r}:${id}:noise`) * 0.16;
  return (
    Math.round(shelf(ref * RETAILER_FACTOR[r] * noise * stepFactor(`${r}:${id}`, day)) * 100) / 100
  );
}

const change = (from: number, to: number) => ((to - from) / from) * 100;

function retailerPrice(seed: ProductSeed, r: SimRetailer) {
  const today = dayNumber(PRODUCTS_AS_OF);
  const price = nationalPrice(seed, r, today);
  const at = (days: number) => change(nationalPrice(seed, r, today - days), price);
  const priceChange: PriceChange = {
    d30: at(HORIZONS.d30),
    d90: at(HORIZONS.d90),
    d365: at(HORIZONS.d365),
  };
  return { retailer: STORE[r], sim: r, price, change: priceChange };
}

function summarize(seed: ProductSeed): ProductSummary {
  const [id, name, size, category] = seed;
  const prices = SIM_RETAILERS.filter((r) => isCarried(r, id)).map((r) => retailerPrice(seed, r));
  const cheapest = prices.reduce((a, b) => (b.price < a.price ? b : a));
  return {
    id,
    name,
    size,
    category,
    imageUrl: null,
    price: cheapest.price,
    retailer: cheapest.retailer,
    change: cheapest.change,
    retailerCount: prices.length,
  };
}

let summaries: ProductSummary[] | null = null;

/** Every product, in catalog order. */
export function productSummaries(): ProductSummary[] {
  summaries ??= PRODUCT_SEEDS.map(summarize);
  return summaries;
}

export function productDetail(id: string): ProductDetail {
  const seed = seeds.get(id);
  if (!seed) throw new Error(`Unknown product ${id}`);
  const today = dayNumber(PRODUCTS_AS_OF);
  const start = new Date(TODAY);
  start.setDate(start.getDate() - (HISTORY_DAYS - 1));
  const retailers: RetailerPriceHistory[] = SIM_RETAILERS.filter((r) => isCarried(r, id))
    .map((r) => {
      const { retailer, price, change: c } = retailerPrice(seed, r);
      const values = Array.from({ length: HISTORY_DAYS }, (_, i) =>
        nationalPrice(seed, r, today - (HISTORY_DAYS - 1) + i),
      );
      return { retailer, price, change: c, history: { startDate: toISODate(start), values } };
    })
    .sort((a, b) => a.price - b.price);
  return { ...summarize(seed), asOf: PRODUCTS_AS_OF, retailers };
}

export const isProduct = (id: string) => seeds.has(id);

/** A verdict from the 1-year change, for products without a curated fixture verdict. */
export function verdictFromChange(c: PriceChange): Verdict {
  const y = c.d365 ?? 0;
  return y >= 8 ? 'gouge' : y >= 3 ? 'sticky' : 'track';
}
