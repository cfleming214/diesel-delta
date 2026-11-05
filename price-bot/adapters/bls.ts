// BLS Average Price Data (the `bls-ap` source): monthly all-outlet averages for about 70 food items,
// for the U.S. and the four Census regions. It is a benchmark rather than a retailer, so it does
// not implement SourceAdapter. It reads three public-domain bulk files from
// download.bls.gov/pub/time.series/ap/ (layout described in ap.txt there), all through PoliteHttp:
//
//   ap.item         item codes and names; the name states the unit ("per lb. (453.6 gm)")
//   ap.series       one row per series: area, item, first and last published month
//   ap.data.3.Food  every monthly value for the food series, 1980 onwards
//
// The files are tab-separated with CRLF line endings, and IDs are padded with spaces. A missing
// value is written "-" with a footnote code (e.g. X: the 2025 lapse in appropriations).
import type { FetchContext } from './types';
import { sizeRatio, type Size } from '../units';

export const BLS_SOURCE_ID = 'bls-ap';
export const BLS_DEFAULT_URL = 'https://download.bls.gov';
const AP_PATH = '/pub/time.series/ap';

/** The areas we load: U.S. city average and the four Census regions. */
export const BLS_AREAS = {
  '0000': 'nat',
  '0100': 'northeast',
  '0200': 'midwest',
  '0300': 'south',
  '0400': 'west',
} as const;
export type BlsAreaCode = keyof typeof BLS_AREAS;
export type BlsRegion = (typeof BLS_AREAS)[BlsAreaCode];

export type BlsSeries = {
  id: string;
  areaCode: BlsAreaCode;
  itemCode: string;
  /** First and last published months, as YYYY-MM-01. */
  begin: string;
  end: string;
};

export type BlsValue = { seriesId: string; month: string; price: number };

const isArea = (a: string): a is BlsAreaCode => a in BLS_AREAS;

/** `APU0000709112` → area 0000, item 709112. */
export function splitSeriesId(id: string): { areaCode: string; itemCode: string } | null {
  const m = /^APU([0-9A-Z]{4})([0-9A-Z]{6})$/.exec(id);
  return m ? { areaCode: m[1]!, itemCode: m[2]! } : null;
}

export const seriesIdFor = (areaCode: string, itemCode: string) => `APU${areaCode}${itemCode}`;

/** Rows of a BLS tab file as trimmed cells, keyed by the header row. */
function rows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = (lines.shift() ?? '').split('\t').map((h) => h.trim());
  if (!header.includes('series_id') && !header.includes('item_code')) {
    throw new Error(`not a BLS AP file (header: ${header.join(', ').slice(0, 80)})`);
  }
  return lines.map((l) => {
    const cells = l.split('\t');
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

/** `M09` of 2026 → 2026-09-01. Annual averages (M13) and other periods return null. */
function monthOf(year: string, period: string): string | null {
  const m = /^M(0[1-9]|1[0-2])$/.exec(period);
  return m && /^\d{4}$/.test(year) ? `${year}-${m[1]}-01` : null;
}

export function parseItems(text: string): Map<string, string> {
  return new Map(rows(text).map((r) => [r.item_code!, r.item_name!]));
}

/** Series in the areas we load (U.S. and Census regions); metro and city-size series are skipped. */
export function parseSeries(text: string): BlsSeries[] {
  const out: BlsSeries[] = [];
  for (const r of rows(text)) {
    const begin = monthOf(r.begin_year!, r.begin_period!);
    const end = monthOf(r.end_year!, r.end_period!);
    if (!isArea(r.area_code!) || !begin || !end) continue;
    out.push({ id: r.series_id!, areaCode: r.area_code, itemCode: r.item_code!, begin, end });
  }
  return out;
}

/** Monthly values for the wanted series. Missing values ("-") and non-monthly periods are skipped. */
export function parseData(text: string, wanted: Set<string>): BlsValue[] {
  const out: BlsValue[] = [];
  for (const line of text.split(/\r?\n/)) {
    // Faster than rows(): the Food file is ~150k lines and we keep a small share of them.
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const seriesId = line.slice(0, tab).trim();
    if (!wanted.has(seriesId)) continue;
    const [, year = '', period = '', value = ''] = line.split('\t').map((c) => c.trim());
    const month = monthOf(year, period);
    const price = Number(value);
    if (!month || value === '' || !Number.isFinite(price) || price <= 0) continue;
    out.push({ seriesId, month, price });
  }
  return out;
}

/**
 * What one quoted price buys, from BLS's item name: "per lb. (453.6 gm)" → 1 lb,
 * "per 1/2 gal. (1.9 lit)" → 0.5 gal, "per doz." → 12 ct, "per 12 oz. (354.9 ml)" → 12 fl oz,
 * "(cost per pound/453.6 grams)" → 1 lb, "per 2 liters (67.6 oz)" → 2 l. Ounces are fluid when
 * BLS gives a metric volume next to them. Returns null for anything else (therms, KWH, ...).
 */
export function parseBlsUnit(itemName: string): Size | null {
  const at = itemName.toLowerCase().lastIndexOf('per ');
  if (at < 0) return null;
  const text = itemName.slice(at + 4).toLowerCase();
  const m =
    /^(1\/2|one-half|\d+(?:\.\d+)?)?\s*(lb|pound|ounces?|oz|gal(?:lon)?|doz|liters?|liter)\b/.exec(
      text,
    );
  if (!m) return null;
  const qty = !m[1] ? 1 : m[1] === '1/2' || m[1] === 'one-half' ? 0.5 : Number(m[1]);
  const word = m[2]!;
  if (word === 'lb' || word === 'pound') return { qty, unit: 'lb' };
  if (word.startsWith('gal')) return { qty, unit: 'gal' };
  if (word === 'doz') return { qty: qty * 12, unit: 'ct' };
  if (word.startsWith('liter')) return { qty, unit: 'l' };
  const fluid = /\b(ml|lit|liters?)\b/.test(text);
  return { qty, unit: fluid ? 'fl_oz' : 'oz' };
}

/**
 * A BLS average price scaled to a catalog item's size: e.g. $4.10 per lb → $8.20 for a 2 lb bag.
 * Null when the units measure different things (weight against count, say).
 */
export function blsPriceForSize(price: number, blsUnit: Size, itemSize: Size): number | null {
  const ratio = sizeRatio(itemSize, blsUnit);
  return ratio === null ? null : Math.round(price * ratio * 1000) / 1000;
}

export type BlsFiles = { items: Map<string, string>; series: BlsSeries[]; data: string };

/**
 * Downloads the three files. ap.data.3.Food is ~6 MB and is only parsed for the series the
 * caller wants (parseData), so it is returned as text.
 */
export async function fetchBlsFiles(
  ctx: FetchContext,
  opts: { baseUrl?: string; minIntervalMs?: number } = {},
): Promise<BlsFiles> {
  const base = (opts.baseUrl ?? BLS_DEFAULT_URL).replace(/\/$/, '');
  const origin = new URL(base);
  const get = async (file: string) => {
    const url = `${base}${AP_PATH}/${file}`;
    const res = await ctx.http.get({
      sourceId: BLS_SOURCE_ID,
      host: origin.host,
      // BLS asks bulk users to keep the request rate low; three files a month needs no speed.
      minIntervalMs: opts.minIntervalMs ?? 5000,
      url,
      robotsUrl: `${origin.origin}/robots.txt`,
      rawKey: `${ctx.rawKey}/${file}`,
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.body;
  };
  const items = parseItems(await get('ap.item'));
  const series = parseSeries(await get('ap.series'));
  const data = await get('ap.data.3.Food');
  return { items, series, data };
}
