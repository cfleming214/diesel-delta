// The monthly BLS ingest (`npm run bot -- bls`). It loads every BLS product with a current U.S.
// price, plus any product the catalog maps: the national series and the matching Census-region
// series into `bls_series` and `bls_prices`, with their full history, and one row per product into
// `bls_products` (the app's products). Re-running upserts, so it is safe to run on any day; BLS
// publishes the previous month's averages with the CPI, around mid-month.
//
// A product is current when BLS published its U.S. average in the latest month. Products that stop
// keep their row and history with current = false.
//
// It also checks the catalog's mappings, which were written by hand. These are reported as
// problems and don't fail the run:
//   missing    the series ID isn't in ap.series
//   stale      BLS stopped publishing it before the latest month
//   unit       BLS's unit can't be read, or it measures something else than the item's size
import {
  BLS_AREAS,
  type BlsAreaCode,
  type BlsSeries,
  fetchBlsFiles,
  blsUnitLabel,
  parseBlsUnit,
  parseData,
  seriesIdFor,
  splitSeriesId,
} from './adapters/bls';
import type { BlsProductMeta, CanonicalItem } from './catalog';
import type { BlsProductRow, BotDb } from './db';
import type { PoliteHttp } from './http';
import { sizeRatio, toBase } from './units';

export type BlsProblem = {
  itemId: string;
  seriesId: string;
  kind: 'missing' | 'stale' | 'unit';
  detail: string;
};

export type BlsSummary = {
  runId: number;
  status: 'succeeded' | 'failed';
  /** Latest month BLS has published for any national series. */
  latestMonth: string | null;
  items: number;
  series: number;
  /** Series with a value in the latest month, per region. */
  current: Record<string, number>;
  prices: number;
  /** Rows written to bls_products, and how many are current. */
  products: number;
  currentProducts: number;
  problems: BlsProblem[];
  /** Current products with no catalog item: BLS-only, no retailer lines (e.g. fuels). */
  unmapped: string[];
  /** Current products missing from catalog/bls_products.csv, shown under BLS's own name. */
  unlabeled: string[];
  error?: string;
  durationMs: number;
};

export type BlsPlan = {
  /** Series to load: every region that has a planned item code. */
  series: (BlsSeries & { itemName: string })[];
  /** One row per planned item code, without updated_at. */
  products: Omit<BlsProductRow, 'updated_at'>[];
  latestMonth: string | null;
  problems: BlsProblem[];
  unmapped: string[];
  unlabeled: string[];
};

/** BLS's name without its unit: "Bananas, per lb. (453.6 gm)" → "Bananas". */
export const blsShortName = (name: string) =>
  name.split(/,? \(?(?:cost )?per /)[0]!.replace(/,\s*$/, '');

/**
 * Which products and series to load, and what is wrong with the catalog's mappings. Plans every
 * product with a current U.S. series, every product the catalog maps, and `known` codes (products
 * already stored, so ones that stopped are marked not current).
 */
export function planBls(
  items: CanonicalItem[],
  files: { items: Map<string, string>; series: BlsSeries[] },
  meta: Map<string, BlsProductMeta> = new Map(),
  known: string[] = [],
): BlsPlan {
  const byId = new Map(files.series.map((s) => [s.id, s]));
  const national = files.series.filter((s) => s.areaCode === '0000');
  const latestMonth = national.reduce<string | null>((m, s) => (!m || s.end > m ? s.end : m), null);
  const problems: BlsProblem[] = [];
  const codes = new Set<string>();

  for (const item of items) {
    const seriesId = item.blsSeriesId;
    if (!seriesId) continue;
    const s = byId.get(seriesId);
    if (!s) {
      problems.push({ itemId: item.id, seriesId, kind: 'missing', detail: 'not in ap.series' });
      continue;
    }
    codes.add(s.itemCode);
    if (latestMonth && s.end < latestMonth) {
      problems.push({
        itemId: item.id,
        seriesId,
        kind: 'stale',
        detail: `last published ${s.end.slice(0, 7)}, latest is ${latestMonth.slice(0, 7)}`,
      });
    }
    const name = files.items.get(s.itemCode) ?? '';
    const unit = parseBlsUnit(name);
    if (!unit || sizeRatio(item.size, unit) === null) {
      problems.push({
        itemId: item.id,
        seriesId,
        kind: 'unit',
        detail: unit
          ? `BLS prices ${unit.qty} ${unit.unit}, the item is ${item.size.qty} ${item.size.unit}`
          : `can't read the unit in "${name}"`,
      });
    }
  }

  const mapped = new Set(codes);
  const current = new Set(national.filter((s) => s.end === latestMonth).map((s) => s.itemCode));
  for (const code of [...current, ...known]) codes.add(code);
  const categoryOf = new Map(
    items.filter((i) => i.blsSeriesId).map((i) => [i.blsSeriesId!.slice(7), i.category]),
  );

  const series: BlsPlan['series'] = [];
  const products: BlsPlan['products'] = [];
  const unlabeled: string[] = [];
  for (const code of [...codes].sort()) {
    const itemName = files.items.get(code);
    const areas = (Object.keys(BLS_AREAS) as BlsAreaCode[]).flatMap((area) => {
      const s = byId.get(seriesIdFor(area, code));
      return s ? [s] : [];
    });
    if (!itemName || !areas.some((s) => s.areaCode === '0000')) continue;
    for (const s of areas) series.push({ ...s, itemName });

    const unit = parseBlsUnit(itemName);
    const base = unit ? toBase(unit) : null;
    const m = meta.get(code);
    const isCurrent = current.has(code);
    if (isCurrent && !m) unlabeled.push(code);
    products.push({
      item_code: code,
      item_name: itemName,
      display_name: m?.displayName ?? blsShortName(itemName),
      // Five-character codes are fuels; otherwise the mapped catalog item's category.
      category: m?.category ?? (code.length === 5 ? 'Fuel' : (categoryOf.get(code) ?? 'Pantry')),
      unit_qty: unit?.qty ?? null,
      unit: unit?.unit ?? null,
      unit_label: m?.unitLabel ?? (unit ? blsUnitLabel(unit) : 'per unit'),
      base_qty: base ? Math.round(base.qty * 10_000) / 10_000 : null,
      base_dimension: base?.dimension ?? null,
      current: isCurrent,
      latest_month: areas.find((s) => s.areaCode === '0000')!.end,
      regions_current: areas.filter((s) => s.end === latestMonth).map((s) => BLS_AREAS[s.areaCode]),
    });
  }
  const unmapped = [...current].filter((c) => !mapped.has(c)).sort();
  return { series, products, latestMonth, problems, unmapped, unlabeled };
}

export async function runBls(opts: {
  db: BotDb;
  http: PoliteHttp;
  items: CanonicalItem[];
  /** Curated names and categories (catalog/bls_products.csv). */
  meta?: Map<string, BlsProductMeta>;
  baseUrl?: string;
  minIntervalMs?: number;
  log?: (m: string) => void;
}): Promise<BlsSummary> {
  const started = Date.now();
  const { db } = opts;
  const runId = await db.startRun('bls-ap', { baseUrl: opts.baseUrl ?? null });
  const summary: BlsSummary = {
    runId,
    status: 'failed',
    latestMonth: null,
    items: opts.items.filter((i) => i.blsSeriesId).length,
    series: 0,
    current: {},
    prices: 0,
    products: 0,
    currentProducts: 0,
    problems: [],
    unmapped: [],
    unlabeled: [],
    durationMs: 0,
  };
  try {
    const files = await fetchBlsFiles(
      { http: opts.http, rawKey: `bls-${runId}` },
      { baseUrl: opts.baseUrl, minIntervalMs: opts.minIntervalMs },
    );
    const plan = planBls(opts.items, files, opts.meta, await db.blsProductCodes());
    summary.latestMonth = plan.latestMonth;
    summary.problems = plan.problems;
    summary.unmapped = plan.unmapped;
    summary.unlabeled = plan.unlabeled;
    summary.series = plan.series.length;

    const values = parseData(files.data, new Set(plan.series.map((s) => s.id)));
    const now = new Date().toISOString();
    await db.upsertBlsSeries(
      plan.series.map((s) => {
        const unit = parseBlsUnit(s.itemName);
        return {
          id: s.id,
          item_code: s.itemCode,
          area_code: s.areaCode,
          region: BLS_AREAS[s.areaCode],
          item_name: s.itemName,
          unit_qty: unit?.qty ?? null,
          unit: unit?.unit ?? null,
          begin_month: s.begin,
          end_month: s.end,
          updated_at: now,
        };
      }),
    );
    await db.upsertBlsPrices(
      values.map((v) => ({ series_id: v.seriesId, month: v.month, price: v.price, run_id: runId })),
    );
    await db.upsertBlsProducts(plan.products.map((p) => ({ ...p, updated_at: now })));
    summary.prices = values.length;
    summary.products = plan.products.length;
    summary.currentProducts = plan.products.filter((p) => p.current).length;
    for (const v of values) {
      if (v.month !== plan.latestMonth) continue;
      const region = BLS_AREAS[splitSeriesId(v.seriesId)!.areaCode as BlsAreaCode];
      summary.current[region] = (summary.current[region] ?? 0) + 1;
    }
    summary.status = 'succeeded';
  } catch (e) {
    summary.error = e instanceof Error ? e.message : String(e);
    opts.log?.(`bls-ap failed: ${summary.error}`);
  }
  summary.durationMs = Date.now() - started;
  const { runId: _id, durationMs: _ms, ...detail } = summary;
  await db.finishRun(runId, summary.status, summary.prices, detail);
  return summary;
}

export function formatBlsSummary(s: BlsSummary): string {
  const lines = [
    `bls-ap  run ${s.runId}  ${s.status}  latest ${s.latestMonth?.slice(0, 7) ?? '-'}  items ${s.items}  series ${s.series}  prices ${s.prices}  ${(s.durationMs / 1000).toFixed(1)} s`,
  ];
  if (s.error) lines.push(`  error: ${s.error}`);
  const regions = Object.values(BLS_AREAS).map((r) => `${r} ${s.current[r] ?? 0}`);
  if (s.status === 'succeeded') {
    lines.push(`  current in latest month: ${regions.join(', ')}`);
    lines.push(`  products ${s.products} (${s.currentProducts} current)`);
  }
  if (s.unmapped.length) lines.push(`  BLS only (no catalog item): ${s.unmapped.join(', ')}`);
  if (s.unlabeled.length) {
    lines.push(
      `  missing from bls_products.csv, shown under BLS's name: ${s.unlabeled.join(', ')}`,
    );
  }
  for (const p of s.problems) {
    lines.push(`  ${p.kind.padEnd(8)} ${p.itemId.padEnd(16)} ${p.seriesId}  ${p.detail}`);
  }
  return lines.join('\n');
}
