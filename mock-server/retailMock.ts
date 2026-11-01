// Simulated retailers for developing the price bot without credentials. Every product and price
// here is generated: deterministic per (item, retailer, store, day), with step changes, promos,
// stock-outs, rare bad values and a few shrinking package sizes, so each pipeline stage has
// something to do. The API shape is our own, not any real retailer's.
import {
  dayNumber,
  hash,
  isCarried,
  rand,
  RETAILER_FACTOR,
  shelf,
  stepFactor,
} from '@/data/fixtures/priceSim';

import { type CanonicalItem, loadCatalog, sizeLabel } from '../price-bot/catalog';

export const MOCK_RETAILERS = ['kroger', 'walmart', 'amazon'] as const;
export type MockRetailer = (typeof MOCK_RETAILERS)[number];

type Padd = 'east' | 'mid' | 'gulf' | 'rocky' | 'west';

export type MockStore = {
  locationId: string;
  name: string;
  zip: string;
  state: string;
  padd: Padd;
};

export type MockProduct = {
  sku: string;
  gtin: string;
  title: string;
  brand: string;
  size: string;
  /** The catalog item this product really is, or null for decoys. Never sent to clients. */
  itemId: string | null;
};

export type MockOffer = Omit<MockProduct, 'itemId'> & {
  price: { regular: number; promo: number | null };
  inStock: boolean;
};

const STORE_BRAND: Record<MockRetailer, string> = {
  kroger: 'Kroger',
  walmart: 'Great Value',
  amazon: 'Amazon Fresh',
};
const REGION_FACTOR: Record<Padd, number> = {
  east: 1.06,
  mid: 0.98,
  gulf: 0.96,
  rocky: 1.0,
  west: 1.1,
};

type StoreRow = [id: string, name: string, zip: string, state: string, padd: Padd];
const store = ([locationId, name, zip, state, padd]: StoreRow): MockStore => ({
  locationId,
  name,
  zip,
  state,
  padd,
});

/** Two stores per PADD region for the store-priced retailers; Amazon is online only. */
export const MOCK_STORES: Record<MockRetailer, MockStore[]> = {
  kroger: (
    [
      ['014-00513', 'Kroger Columbus', '43215', 'OH', 'mid'],
      ['014-00721', 'Kroger Indianapolis', '46204', 'IN', 'mid'],
      ['029-00316', 'Kroger Atlanta', '30303', 'GA', 'east'],
      ['011-00402', 'Kroger Richmond', '23219', 'VA', 'east'],
      ['034-00178', 'Kroger Houston', '77002', 'TX', 'gulf'],
      ['035-00490', 'Kroger Dallas', '75201', 'TX', 'gulf'],
      ['620-00211', 'King Soopers Denver', '80202', 'CO', 'rocky'],
      ['620-00342', 'Smith’s Salt Lake City', '84101', 'UT', 'rocky'],
      ['703-00105', 'Ralphs Los Angeles', '90012', 'CA', 'west'],
      ['701-00288', 'Fred Meyer Portland', '97201', 'OR', 'west'],
    ] as StoreRow[]
  ).map(store),
  walmart: (
    [
      ['W1823', 'Walmart Columbus', '43215', 'OH', 'mid'],
      ['W2650', 'Walmart Chicago', '60601', 'IL', 'mid'],
      ['W0965', 'Walmart Atlanta', '30303', 'GA', 'east'],
      ['W3401', 'Walmart Philadelphia', '19103', 'PA', 'east'],
      ['W0471', 'Walmart Houston', '77002', 'TX', 'gulf'],
      ['W1212', 'Walmart New Orleans', '70112', 'LA', 'gulf'],
      ['W2155', 'Walmart Denver', '80202', 'CO', 'rocky'],
      ['W3017', 'Walmart Boise', '83702', 'ID', 'rocky'],
      ['W5643', 'Walmart Los Angeles', '90012', 'CA', 'west'],
      ['W2516', 'Walmart Seattle', '98101', 'WA', 'west'],
    ] as StoreRow[]
  ).map(store),
  amazon: [],
};

/** Items that shrink at one retailer on a set day, keeping the price (shrinkflation). */
const SHRINKS: { itemId: string; retailer: MockRetailer; day: string; factor: number }[] = [
  { itemId: 'chips', retailer: 'kroger', day: '2026-10-12', factor: 0.9375 },
  { itemId: 'cereal', retailer: 'walmart', day: '2026-10-19', factor: 0.9167 },
  { itemId: 'ice_cream', retailer: 'amazon', day: '2026-10-05', factor: 0.9167 },
];

function sizeText(item: CanonicalItem, factor = 1): string {
  if (factor === 1) return sizeLabel(item);
  return `${Math.round(item.size.qty * factor * 100) / 100} ${item.size.unit.replace('_', ' ')}`;
}

export function createRetailMock(items: CanonicalItem[] = loadCatalog()) {
  const byId = new Map(items.map((i) => [i.id, i]));

  /** Each retailer carries ~97% of the catalog, plus decoys the matcher must not accept. */
  const products: Record<MockRetailer, MockProduct[]> = { kroger: [], walmart: [], amazon: [] };
  for (const r of MOCK_RETAILERS) {
    items.forEach((item, n) => {
      if (!isCarried(r, item.id)) return;
      const brand = item.brand ?? STORE_BRAND[r];
      const sku = `${r.slice(0, 2).toUpperCase()}${String(100000 + n * 7 + (hash(r) % 7))}`;
      const gtin = String(hash(`${r}:${item.id}:gtin`) % 10 ** 11).padStart(11, '0') + '0';
      products[r].push({
        sku,
        gtin,
        title: `${brand} ${item.name.replace(new RegExp(`^${brand}\\s+`, 'i'), '')}, ${sizeText(item)}`,
        brand,
        size: sizeText(item),
        itemId: item.id,
      });
      // Decoys: an organic variant or a much bigger pack of some items.
      if (rand(`${r}:${item.id}:decoy`) < 0.12 && item.pricedBy === 'package') {
        const organic = rand(`${r}:${item.id}:decoy-kind`) < 0.5;
        products[r].push({
          sku: `${sku}D`,
          gtin: String(hash(`${r}:${item.id}:decoy-gtin`) % 10 ** 11).padStart(11, '0') + '1',
          title: organic
            ? `${brand} Organic ${item.name}, ${sizeText(item)}`
            : `${brand} ${item.name} Value Pack, ${sizeText(item, 3)}`,
          brand,
          size: organic ? sizeText(item) : sizeText(item, 3),
          itemId: null,
        });
      }
    });
  }
  const bySku = new Map(
    MOCK_RETAILERS.flatMap((r) => products[r].map((p) => [`${r}:${p.sku}`, p] as const)),
  );

  function offer(r: MockRetailer, p: MockProduct, store: MockStore | null, iso: string) {
    const day = dayNumber(iso);
    const item = p.itemId ? byId.get(p.itemId) : null;
    const where = store?.locationId ?? 'online';
    const ref = item?.refPrice ?? 3.99;
    const decoyFactor = item ? 1 : p.title.includes('Organic') ? 1.45 : 2.6;
    const shrink = SHRINKS.find((s) => s.itemId === p.itemId && s.retailer === r);
    const shrunk = shrink && day >= dayNumber(shrink.day);

    let price =
      ref *
      decoyFactor *
      RETAILER_FACTOR[r] *
      (store ? REGION_FACTOR[store.padd] : 1) *
      (0.92 + rand(`${r}:${p.sku}:noise`) * 0.16) *
      (0.98 + rand(`${r}:${where}:${p.sku}:store`) * 0.04) *
      stepFactor(`${r}:${p.sku}`, day);
    const week = Math.floor(day / 7);
    const onPromo = rand(`${r}:${where}:${p.sku}:promo:${week}`) < 0.08;
    // Rare bad values (a misplaced decimal) for validation to catch.
    if (rand(`${r}:${where}:${p.sku}:glitch:${day}`) < 0.0005) price *= 10;
    const regular = shelf(price);
    return {
      sku: p.sku,
      gtin: p.gtin,
      title: p.title,
      brand: p.brand,
      size: shrunk && item ? sizeText(item, shrink.factor) : p.size,
      price: {
        regular,
        promo: onPromo
          ? shelf(regular * (0.75 + rand(`${r}:${p.sku}:promo-depth:${week}`) * 0.15))
          : null,
      },
      inStock: rand(`${r}:${where}:${p.sku}:stock:${day}`) >= 0.02,
    } satisfies MockOffer;
  }

  return {
    products,
    stores: MOCK_STORES,
    /** Products for one store (or online) on one day; unknown SKUs are left out. */
    offers(r: MockRetailer, skus: string[], locationId: string | null, iso: string): MockOffer[] {
      const store = locationId ? MOCK_STORES[r].find((s) => s.locationId === locationId) : null;
      if (locationId && !store) throw new Error(`unknown location ${locationId}`);
      return skus
        .map((sku) => bySku.get(`${r}:${sku}`))
        .filter((p): p is MockProduct => !!p)
        .map((p) => offer(r, p, store ?? null, iso));
    },
  };
}

export type RetailMock = ReturnType<typeof createRetailMock>;

export const isMockRetailer = (r: string): r is MockRetailer =>
  (MOCK_RETAILERS as readonly string[]).includes(r);
