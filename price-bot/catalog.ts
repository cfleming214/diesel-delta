// The canonical catalog: item specs the bot prices at every retailer (catalog/items.csv), and the
// curated names and categories of the BLS products they sit under (catalog/bls_products.csv).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isUnit, type Unit } from './units';

export const CATEGORIES = [
  'Dairy',
  'Meat',
  'Produce',
  'Bakery',
  'Pantry',
  'Canned',
  'Frozen',
  'Beverages',
  'Snacks',
  'Household',
  'Personal care',
  'Fuel',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Categories no grocery retailer sells. Their items are BLS benchmarks only: the BLS ingest loads
 * them, while retailer collection, the mock retailers, reports and the app's product list skip them.
 */
export const BENCHMARK_CATEGORIES: readonly Category[] = ['Fuel'];
export const isShelfItem = (item: Pick<CanonicalItem, 'category'>) =>
  !BENCHMARK_CATEGORIES.includes(item.category);

/** How the retailer sells it: a fixed package, by weight, or by the piece. */
export type PricedBy = 'package' | 'lb' | 'each';
/** `national` pins the brand; `cheapest_comparable` allows store brands. */
export type BrandPolicy = 'national' | 'cheapest_comparable';

export type CanonicalItem = {
  id: string;
  name: string;
  category: Category;
  size: { qty: number; unit: Unit };
  pricedBy: PricedBy;
  /** Allowed relative size difference, e.g. 0.1 = ±10%. */
  sizeTolerance: number;
  brandPolicy: BrandPolicy;
  brand: string | null;
  /** Approximate U.S. shelf price, used for mock data and first validation bands only. */
  refPrice: number;
  /** BLS Average Price series ID; unverified until the BLS adapter fetches it (P6). */
  blsSeriesId: string | null;
  inDefaultBasket: boolean;
};

const COLUMNS = [
  'id',
  'name',
  'category',
  'size_qty',
  'size_unit',
  'priced_by',
  'size_tolerance',
  'brand_policy',
  'brand',
  'ref_price',
  'bls_series_id',
  'in_default_basket',
] as const;

export const CATALOG_PATH = join(__dirname, 'catalog', 'items.csv');

/** Parses and validates the catalog CSV. Throws with every problem found, one per line. */
export function parseCatalog(csv: string): CanonicalItem[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines.shift()?.split(',');
  if (header?.join(',') !== COLUMNS.join(',')) {
    throw new Error(`catalog header must be: ${COLUMNS.join(',')}`);
  }
  const errors: string[] = [];
  const items: CanonicalItem[] = [];
  const seen = new Set<string>();

  lines.forEach((line, i) => {
    const row = i + 2;
    const fail = (msg: string) => errors.push(`row ${row}: ${msg}`);
    if (line.includes('"')) return fail('quoted fields are not supported');
    const cells = line.split(',');
    if (cells.length !== COLUMNS.length) return fail(`expected ${COLUMNS.length} columns`);
    const c = Object.fromEntries(COLUMNS.map((k, j) => [k, cells[j]!.trim()])) as Record<
      (typeof COLUMNS)[number],
      string
    >;

    if (!/^[a-z][a-z0-9_]*$/.test(c.id)) fail(`bad id "${c.id}"`);
    if (seen.has(c.id)) fail(`duplicate id "${c.id}"`);
    seen.add(c.id);
    if (!c.name) fail('name is required');
    if (!(CATEGORIES as readonly string[]).includes(c.category)) {
      fail(`unknown category "${c.category}"`);
    }
    const qty = Number(c.size_qty);
    if (!(qty > 0)) fail(`bad size_qty "${c.size_qty}"`);
    if (!isUnit(c.size_unit)) fail(`unknown size_unit "${c.size_unit}"`);
    if (!['package', 'lb', 'each'].includes(c.priced_by)) fail(`bad priced_by "${c.priced_by}"`);
    if (c.priced_by === 'lb' && !(qty === 1 && c.size_unit === 'lb')) {
      fail('priced_by lb needs size 1 lb');
    }
    if (c.priced_by === 'each' && !(qty === 1 && c.size_unit === 'each')) {
      fail('priced_by each needs size 1 each');
    }
    const tol = Number(c.size_tolerance);
    if (!(tol >= 0 && tol <= 0.25))
      fail(`size_tolerance must be 0–0.25, got "${c.size_tolerance}"`);
    if (!['national', 'cheapest_comparable'].includes(c.brand_policy)) {
      fail(`bad brand_policy "${c.brand_policy}"`);
    }
    if (c.brand_policy === 'national' && !c.brand) fail('national brand_policy needs a brand');
    const ref = Number(c.ref_price);
    if (!(ref > 0 && ref < 100)) fail(`bad ref_price "${c.ref_price}"`);
    if (c.bls_series_id && !/^APU0000[A-Z0-9]{5,6}$/.test(c.bls_series_id)) {
      fail(`bad bls_series_id "${c.bls_series_id}"`);
    }
    if (!['0', '1'].includes(c.in_default_basket)) fail('in_default_basket must be 0 or 1');

    items.push({
      id: c.id,
      name: c.name,
      category: c.category as Category,
      size: { qty, unit: c.size_unit as Unit },
      pricedBy: c.priced_by as PricedBy,
      sizeTolerance: tol,
      brandPolicy: c.brand_policy as BrandPolicy,
      brand: c.brand || null,
      refPrice: ref,
      blsSeriesId: c.bls_series_id || null,
      inDefaultBasket: c.in_default_basket === '1',
    });
  });

  if (errors.length) throw new Error(`catalog is invalid:\n${errors.join('\n')}`);
  return items;
}

/** The catalog's shelf items; `benchmarks: true` also returns the BLS-only items (fuels). */
export function loadCatalog(opts: { path?: string; benchmarks?: boolean } = {}): CanonicalItem[] {
  const items = parseCatalog(readFileSync(opts.path ?? CATALOG_PATH, 'utf8'));
  return opts.benchmarks ? items : items.filter(isShelfItem);
}

/** Display size, e.g. "32 oz", "1 gal", "per lb", "each". */
export function sizeLabel(item: Pick<CanonicalItem, 'size' | 'pricedBy'>): string {
  if (item.pricedBy === 'lb') return 'per lb';
  if (item.pricedBy === 'each') return 'each';
  const unit = item.size.unit === 'fl_oz' ? 'fl oz' : item.size.unit === 'l' ? 'L' : item.size.unit;
  return `${item.size.qty} ${unit.replace('_', ' ')}`;
}

/** Curated display data for a BLS product (catalog/bls_products.csv). */
export type BlsProductMeta = {
  displayName: string;
  category: Category;
  /** Overrides the label made from BLS's unit, e.g. "per 12 oz pint". */
  unitLabel: string | null;
};

export const BLS_PRODUCTS_PATH = join(__dirname, 'catalog', 'bls_products.csv');

/** Parses bls_products.csv into item code → display data. Throws with every problem found. */
export function parseBlsProductMeta(csv: string): Map<string, BlsProductMeta> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.shift() !== 'item_code,display_name,category,unit_label') {
    throw new Error('bls_products header must be: item_code,display_name,category,unit_label');
  }
  const out = new Map<string, BlsProductMeta>();
  const errors: string[] = [];
  lines.forEach((line, i) => {
    const [code = '', displayName = '', category = '', unitLabel = '', ...rest] = line
      .split(',')
      .map((c) => c.trim());
    const fail = (msg: string) => errors.push(`row ${i + 2}: ${msg}`);
    if (rest.length || line.includes('"')) return fail('expected 4 unquoted columns');
    if (!/^[0-9A-Z]{5,6}$/.test(code)) fail(`bad item_code "${code}"`);
    if (out.has(code)) fail(`duplicate item_code "${code}"`);
    if (!displayName) fail('display_name is required');
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      fail(`unknown category "${category}"`);
    }
    out.set(code, { displayName, category: category as Category, unitLabel: unitLabel || null });
  });
  if (errors.length) throw new Error(`bls_products.csv is invalid:\n${errors.join('\n')}`);
  return out;
}

export function loadBlsProductMeta(path = BLS_PRODUCTS_PATH): Map<string, BlsProductMeta> {
  return parseBlsProductMeta(readFileSync(path, 'utf8'));
}
