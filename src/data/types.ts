import type { LedgerTag, Verdict } from '@/domain';

import type { FuelArea } from './geo';

export type RegionKey = 'east' | 'mid' | 'gulf' | 'rocky' | 'west' | 'nat';

/** A PADD region (or the U.S.), e.g. { key: 'gulf', name: 'Gulf Coast (PADD 3)' }. */
export type Region = { key: RegionKey; name: string };

export type FuelSeriesKind = 'diesel' | 'gas';
export type FuelScope = 'national' | 'padd' | 'state';

/** Daily values; index 0 is `startDate` (ISO yyyy-mm-dd), the last index is the latest day. */
export type DailySeries = { startDate: string; values: number[] };

export type Store = 'Kroger' | 'Walmart' | 'Target' | 'Costco' | 'Albertsons' | 'Amazon';

export type CatalogItem = {
  id: string;
  name: string;
  size: string;
  category: string;
  store: Store;
  price: number;
  verdict: Verdict;
};

export type LedgerEntry = {
  date: string;
  from: number;
  to: number;
  /** Fuel price in the user's region on that date. */
  fuelPrice: number;
  tag: LedgerTag;
};

export type ItemDetail = CatalogItem & {
  /** Price before the first tracked increase. */
  basePrice: number;
  /** Current price minus the base price. */
  unreturned: number;
  /** % change over 12 months. */
  changePct: number;
  /** Diesel % change since the last price increase. */
  fuelSincePct: number;
  /** 53 weekly points (12 months) of shelf price and of diesel. */
  weeklyPrice: number[];
  weeklyFuel: number[];
  /** Week index of each price change, for chart markers. */
  changeWeeks: number[];
  /** Weeks where fuel was falling (shaded band), as [startWeek, endWeek]. */
  fuelFallingWeeks: [number, number];
  /** Newest first. */
  ledger: LedgerEntry[];
  /** Sparkline points (every 4th week plus the latest). */
  spark: number[];
};

/** % change in the national price over each horizon; null without enough history. */
export type PriceChange = { d30: number | null; d90: number | null; d365: number | null };

/** A catalog product as Search and Today list it: the cheapest retailer's national price. */
export type ProductSummary = {
  id: string;
  name: string;
  size: string;
  category: string;
  /** Product photo from a retailer listing, when one is known. */
  imageUrl: string | null;
  price: number;
  retailer: Store;
  change: PriceChange;
  /** How many tracked retailers carry it. */
  retailerCount: number;
};

/** One retailer's national price for a product: today's, its changes, and its daily history. */
export type RetailerPriceHistory = {
  retailer: Store;
  price: number;
  change: PriceChange;
  /** One value per day for the past year, ending on `asOf`. */
  history: DailySeries;
};

export type ProductDetail = ProductSummary & {
  /** ISO date of the latest price. */
  asOf: string;
  /** Cheapest first. */
  retailers: RetailerPriceHistory[];
};

export type Provenance = { source: string; captured: string; method: string; confidence: string };

export type CategoryPassThrough = { category: string; pct: number };

export type RetailerScore = {
  name: Store;
  grade: string;
  rollbackPct: number;
  itemsTracked: number;
  categories: { category: string; pct: number }[];
};

export type ZipLookup = {
  zip: string;
  state: { abbr: string; name: string };
  region: Region;
  /** The diesel series used for this ZIP: the state's own, a PADD sub-region, or the PADD. */
  dieselSeries: { area: FuelArea; name: string; level: 'state' | 'subregion' | 'padd' };
  currentDiesel: number;
  /** ISO date of the latest fuel observation. */
  asOf: string;
};

export interface DataApi {
  lookupZip(zip: string): Promise<ZipLookup>;
  getRegions(): Promise<Region[]>;
  getFuelSeries(area: FuelArea, kind: FuelSeriesKind): Promise<DailySeries>;
  /** Basket value series for the given items (equal purchase weights for now). */
  getBasketSeries(itemIds: readonly string[]): Promise<DailySeries>;
  getCatalog(): Promise<CatalogItem[]>;
  searchCatalog(query: string): Promise<{ items: CatalogItem[]; resolvedFromLink: boolean }>;
  /** Resolves a scanned UPC/EAN to a tracked item, or null if none matches. */
  lookupBarcode(code: string): Promise<CatalogItem | null>;
  getItem(id: string, region: RegionKey): Promise<ItemDetail>;
  getProvenance(id: string, zip: string): Promise<Provenance>;
  getCategoryPassThrough(region: RegionKey): Promise<CategoryPassThrough[]>;
  getRetailerScores(): Promise<RetailerScore[]>;
  /** Every tracked product, with the cheapest retailer's price and 30/90/365-day changes. */
  getProducts(): Promise<ProductSummary[]>;
  /** One product with each retailer's price history. */
  getProduct(id: string): Promise<ProductDetail>;
}
