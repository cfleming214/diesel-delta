import type { PoliteHttp } from '../http';
import type { ProductListing } from '../match';
import type { RawOffer } from '../normalize';

export type StoreLocation = {
  externalId: string;
  name: string;
  zip: string;
  state: string;
  padd: 'east' | 'mid' | 'gulf' | 'rocky' | 'west';
};

/** One fetch: up to `batchSize` SKUs at one store (or online), for one day. */
export type FetchTask = {
  sourceId: string;
  retailerId: string;
  /** Our stores.id, or null for online prices. */
  storeId: number | null;
  externalStoreId: string | null;
  skus: string[];
  day: string;
};

export type FetchContext = { http: PoliteHttp; rawKey: string };

export interface SourceAdapter {
  sourceId: string;
  retailerId: string;
  scope: 'store' | 'online';
  /** Rate-limit key and politeness interval for this source's host. */
  host: string;
  minIntervalMs: number;
  batchSize: number;
  locations(ctx: FetchContext): Promise<StoreLocation[]>;
  /** The retailer's listings, for matching to the catalog. */
  discover(ctx: FetchContext): Promise<ProductListing[]>;
  fetchOffers(
    task: FetchTask,
    ctx: FetchContext,
  ): Promise<{ offers: RawOffer[]; rawRef: string | null }>;
}
