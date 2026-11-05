// The monthly BLS ingest (`npm run bot -- bls`). For every catalog item with a `bls_series_id`, it
// loads the national series and the matching Census-region series into `bls_series` and
// `bls_prices`, with their full history. Re-running upserts, so it is safe to run on any day; BLS
// publishes the previous month's averages with the CPI, around mid-month.
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
  parseBlsUnit,
  parseData,
  seriesIdFor,
  splitSeriesId,
} from './adapters/bls';
import type { CanonicalItem } from './catalog';
import type { BotDb } from './db';
import type { PoliteHttp } from './http';
import { sizeRatio } from './units';

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
  problems: BlsProblem[];
  error?: string;
  durationMs: number;
};

export type BlsPlan = {
  /** Series to load: every region that has the mapped item code. */
  series: (BlsSeries & { itemName: string })[];
  latestMonth: string | null;
  problems: BlsProblem[];
};

/** Which series to load for the catalog's mappings, and what is wrong with any of them. */
export function planBls(
  items: CanonicalItem[],
  files: { items: Map<string, string>; series: BlsSeries[] },
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

  const series = [...codes].flatMap((code) =>
    (Object.keys(BLS_AREAS) as BlsAreaCode[]).flatMap((area) => {
      const s = byId.get(seriesIdFor(area, code));
      return s ? [{ ...s, itemName: files.items.get(code) ?? '' }] : [];
    }),
  );
  return { series, latestMonth, problems };
}

export async function runBls(opts: {
  db: BotDb;
  http: PoliteHttp;
  items: CanonicalItem[];
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
    problems: [],
    durationMs: 0,
  };
  try {
    const files = await fetchBlsFiles(
      { http: opts.http, rawKey: `bls-${runId}` },
      { baseUrl: opts.baseUrl, minIntervalMs: opts.minIntervalMs },
    );
    const plan = planBls(opts.items, files);
    summary.latestMonth = plan.latestMonth;
    summary.problems = plan.problems;
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
    summary.prices = values.length;
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
  if (s.status === 'succeeded') lines.push(`  current in latest month: ${regions.join(', ')}`);
  for (const p of s.problems) {
    lines.push(`  ${p.kind.padEnd(8)} ${p.itemId.padEnd(16)} ${p.seriesId}  ${p.detail}`);
  }
  return lines.join('\n');
}
