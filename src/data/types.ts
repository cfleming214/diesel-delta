import type { LedgerTag, Verdict } from '@/domain';

export type RegionKey = 'east' | 'mid' | 'gulf' | 'rocky' | 'west' | 'nat';

export type Region = {
  key: RegionKey;
  /** e.g. "Gulf Coast (PADD 3)" */
  name: string;
  /** State whose retail series is used at state scope. */
  state: string;
  abbr: string;
};

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
  region: Region;
  currentDiesel: number;
  /** ISO date of the latest fuel observation. */
  asOf: string;
};

export interface DataApi {
  lookupZip(zip: string): Promise<ZipLookup>;
  getRegions(): Promise<Region[]>;
  getFuelSeries(region: RegionKey, kind: FuelSeriesKind, scope: FuelScope): Promise<DailySeries>;
  /** Basket value series for the given items (equal purchase weights for now). */
  getBasketSeries(itemIds: readonly string[]): Promise<DailySeries>;
  getCatalog(): Promise<CatalogItem[]>;
  searchCatalog(query: string): Promise<{ items: CatalogItem[]; resolvedFromLink: boolean }>;
  getItem(id: string, region: RegionKey): Promise<ItemDetail>;
  getProvenance(id: string, zip: string): Promise<Provenance>;
  getCategoryPassThrough(region: RegionKey): Promise<CategoryPassThrough[]>;
  getRetailerScores(): Promise<RetailerScore[]>;
}
