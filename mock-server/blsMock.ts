// A stand-in for download.bls.gov/pub/time.series/ap/. ap.item and ap.series are real BLS files
// (public domain), trimmed to the U.S. and Census-region food series and with series titles
// removed (fixtures/bls/). ap.data.3.Food is synthesized from them: monthly prices from 2016 to each
// series' last published month, with October 2025 missing as in the real file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, 'fixtures', 'bls');
const FIRST_YEAR = 2016;

let files: Record<string, string> | null = null;

/** Deterministic 0..1 from a string, so every run serves the same prices. */
function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

function synthesizeData(series: string): string {
  const out = ['series_id        \tyear\tperiod\t       value\tfootnote_codes'];
  for (const line of series.split('\n').slice(1)) {
    const [id, , item, , , by, bp, ey, ep] = line.split('\t');
    if (!id || !item || !ey || !ep) continue;
    const begin = Math.max(Number(by) * 12 + Number(bp!.slice(1)) - 1, FIRST_YEAR * 12);
    const end = Number(ey) * 12 + Number(ep.slice(1)) - 1;
    // Base price from the item, so regions of one item sit close together.
    const base = 1.5 + unit(item) * 6;
    const regional = 0.9 + unit(id.trim()) * 0.2;
    for (let m = begin; m <= end; m++) {
      const year = Math.floor(m / 12);
      const month = (m % 12) + 1;
      const period = `M${String(month).padStart(2, '0')}`;
      if (year === 2025 && month === 10) {
        out.push(`${id}\t${year}\t${period}\t           -\tX`);
        continue;
      }
      const t = m - FIRST_YEAR * 12;
      const price = base * regional * (1 + 0.0025 * t) * (1 + 0.03 * Math.sin(t / 3));
      out.push(`${id}\t${year}\t${period}\t${price.toFixed(3).padStart(12)}\t`);
    }
  }
  return `${out.join('\r\n')}\r\n`;
}

function load(): Record<string, string> {
  if (files) return files;
  const series = readFileSync(join(DIR, 'ap.series'), 'utf8');
  files = {
    'ap.item': readFileSync(join(DIR, 'ap.item'), 'utf8'),
    'ap.series': series,
    'ap.data.3.Food': synthesizeData(series),
  };
  return files;
}

/** The body of one AP file, or null if the mock doesn't serve it. */
export function blsFile(name: string): string | null {
  return load()[name] ?? null;
}
