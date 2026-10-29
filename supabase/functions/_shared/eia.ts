// EIA API v2 client logic for weekly retail fuel prices. Pure TypeScript with no Deno or Node APIs,
// so the Edge Function and the app's Jest suite share it.
// API reference: https://www.eia.gov/opendata/documentation.php

export const EIA_BASE = 'https://api.eia.gov/v2/petroleum/pri/gnd/data/';
/** The API returns at most 5000 rows per request. */
export const EIA_PAGE_SIZE = 5000;

export type FuelKind = 'diesel' | 'gas';
export type SeriesRef = { area: string; kind: FuelKind; eia_series_id: string };
export type WeeklyPrice = {
  area: string;
  kind: FuelKind;
  period: string;
  price_usd_per_gal: number;
};

export function buildEiaUrl(opts: {
  apiKey: string;
  seriesIds: readonly string[];
  start: string;
  offset?: number;
  length?: number;
}): string {
  const p = new URLSearchParams();
  p.set('api_key', opts.apiKey);
  p.set('frequency', 'weekly');
  p.append('data[0]', 'value');
  for (const id of opts.seriesIds) p.append('facets[series][]', id);
  p.set('start', opts.start);
  p.append('sort[0][column]', 'period');
  p.append('sort[0][direction]', 'asc');
  p.set('offset', String(opts.offset ?? 0));
  p.set('length', String(opts.length ?? EIA_PAGE_SIZE));
  return `${EIA_BASE}?${p.toString()}`;
}

type EiaRow = { period?: unknown; series?: unknown; value?: unknown };

export type ParsedPage = {
  rows: WeeklyPrice[];
  /** Total rows matching the query across all pages. */
  total: number;
  /** Rows skipped, with the reason (unknown series, missing or non-positive value, bad date). */
  skipped: { row: unknown; reason: string }[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates one EIA response page and maps rows onto our series. Throws on a malformed envelope. */
export function parseEiaPage(json: unknown, series: readonly SeriesRef[]): ParsedPage {
  const response = (json as { response?: { total?: unknown; data?: unknown } })?.response;
  if (!response || !Array.isArray(response.data)) {
    const error = (json as { error?: unknown })?.error;
    throw new Error(`Unexpected EIA response${error ? `: ${String(error)}` : ''}`);
  }
  const byId = new Map(series.map((s) => [s.eia_series_id, s]));
  const rows: WeeklyPrice[] = [];
  const skipped: ParsedPage['skipped'] = [];
  for (const raw of response.data as EiaRow[]) {
    const ref = typeof raw.series === 'string' ? byId.get(raw.series) : undefined;
    if (!ref) {
      skipped.push({ row: raw, reason: 'unknown series' });
      continue;
    }
    if (typeof raw.period !== 'string' || !ISO_DATE.test(raw.period)) {
      skipped.push({ row: raw, reason: 'bad period' });
      continue;
    }
    // EIA returns values as strings or numbers, and null for unpublished weeks.
    const value = raw.value == null || raw.value === '' ? NaN : Number(raw.value);
    if (!Number.isFinite(value) || value <= 0) {
      skipped.push({ row: raw, reason: 'missing value' });
      continue;
    }
    rows.push({
      area: ref.area,
      kind: ref.kind,
      period: raw.period,
      price_usd_per_gal: Math.round(value * 1000) / 1000,
    });
  }
  const total = Number(response.total);
  return { rows, total: Number.isFinite(total) ? total : rows.length + skipped.length, skipped };
}

export type FetchJson = (url: string) => Promise<unknown>;

/** Fetches every page for the series since `start`. */
export async function fetchWeeklyPrices(opts: {
  apiKey: string;
  series: readonly SeriesRef[];
  start: string;
  fetchJson: FetchJson;
  pageSize?: number;
}): Promise<{ rows: WeeklyPrice[]; skipped: ParsedPage['skipped']; missing: SeriesRef[] }> {
  const pageSize = opts.pageSize ?? EIA_PAGE_SIZE;
  const seriesIds = opts.series.map((s) => s.eia_series_id);
  const rows: WeeklyPrice[] = [];
  const skipped: ParsedPage['skipped'] = [];
  for (let offset = 0;; offset += pageSize) {
    const url = buildEiaUrl({
      apiKey: opts.apiKey,
      seriesIds,
      start: opts.start,
      offset,
      length: pageSize,
    });
    const page = parseEiaPage(await opts.fetchJson(url), opts.series);
    rows.push(...page.rows);
    skipped.push(...page.skipped);
    const seen = offset + page.rows.length + page.skipped.length;
    if (seen >= page.total || page.rows.length + page.skipped.length === 0) break;
  }
  const present = new Set(rows.map((r) => `${r.area}/${r.kind}`));
  const missing = opts.series.filter((s) => !present.has(`${s.area}/${s.kind}`));
  return { rows, skipped, missing };
}

/**
 * Where to start fetching: four weeks before the latest stored week (EIA revises recent weeks),
 * or `backfillYears` before `today` when nothing is stored yet.
 */
export function startDate(latestStored: string | null, today: Date, backfillYears = 3): string {
  const d = latestStored ? new Date(`${latestStored}T00:00:00Z`) : new Date(today);
  if (latestStored) d.setUTCDate(d.getUTCDate() - 28);
  else d.setUTCFullYear(d.getUTCFullYear() - backfillYears);
  return d.toISOString().slice(0, 10);
}
