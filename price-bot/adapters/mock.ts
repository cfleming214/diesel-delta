// Adapter for the simulated retailers in mock-server/retailMock.ts. It passes the run's day to
// the mock so a simulation can replay past days; real adapters always get today's prices.
import type { ProductListing } from '../match';
import type { RawOffer } from '../normalize';
import type { FetchContext, FetchTask, SourceAdapter, StoreLocation } from './types';

type MockOffer = {
  sku: string;
  gtin: string;
  title: string;
  brand: string;
  size: string;
  price: { regular: number; promo: number | null };
  inStock: boolean;
};

export function mockAdapter(opts: {
  retailerId: 'kroger' | 'walmart' | 'amazon';
  /** Mock server origin, e.g. http://localhost:54321. */
  baseUrl: string;
  minIntervalMs?: number;
}): SourceAdapter {
  const root = `${opts.baseUrl}/retail-mock/${opts.retailerId}`;
  const robotsUrl = `${root}/robots.txt`;
  const sourceId = `mock-${opts.retailerId}`;
  const host = `${new URL(opts.baseUrl).host}/${opts.retailerId}`;
  const minIntervalMs = opts.minIntervalMs ?? 50;

  const getJson = async <T>(ctx: FetchContext, url: string) => {
    const res = await ctx.http.get({
      sourceId,
      host,
      minIntervalMs,
      url,
      robotsUrl,
      rawKey: ctx.rawKey,
    });
    if (res.status !== 200)
      throw new Error(`HTTP ${res.status} from ${url}: ${res.body.slice(0, 200)}`);
    return { json: JSON.parse(res.body) as T, rawRef: res.rawRef };
  };

  return {
    sourceId,
    retailerId: opts.retailerId,
    scope: opts.retailerId === 'amazon' ? 'online' : 'store',
    host,
    minIntervalMs,
    batchSize: 50,

    async locations(ctx) {
      const { json } = await getJson<{
        data: {
          locationId: string;
          name: string;
          zip: string;
          state: string;
          padd: StoreLocation['padd'];
        }[];
      }>(ctx, `${root}/locations`);
      return json.data.map((l) => ({
        externalId: l.locationId,
        name: l.name,
        zip: l.zip,
        state: l.state,
        padd: l.padd,
      }));
    },

    async discover(ctx) {
      const out: ProductListing[] = [];
      for (let offset = 0; ; offset += 50) {
        const { json } = await getJson<{ data: MockOffer[]; total: number }>(
          { ...ctx, rawKey: `${ctx.rawKey}-${offset}` },
          `${root}/catalog?offset=${offset}&limit=50`,
        );
        out.push(
          ...json.data.map((p) => ({
            sku: p.sku,
            gtin: p.gtin,
            title: p.title,
            brand: p.brand,
            size: p.size,
          })),
        );
        if (offset + 50 >= json.total) return out;
      }
    },

    async fetchOffers(task: FetchTask, ctx) {
      const params = new URLSearchParams({ skus: task.skus.join(','), date: task.day });
      if (task.externalStoreId) params.set('locationId', task.externalStoreId);
      const { json, rawRef } = await getJson<{ data: MockOffer[] }>(
        ctx,
        `${root}/products?${params}`,
      );
      const offers: RawOffer[] = json.data.map((o) => ({
        sku: o.sku,
        gtin: o.gtin,
        title: o.title,
        brand: o.brand,
        size: o.size,
        regular: o.price.regular,
        promo: o.price.promo,
        member: null,
        inStock: o.inStock,
      }));
      return { offers, rawRef };
    },
  };
}
