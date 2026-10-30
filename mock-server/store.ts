// In-memory tables mirroring the Supabase schema (supabase/migrations).
import type { SeriesRef, WeeklyPrice } from '../supabase/functions/_shared/eia.ts';
import { ALL_SERIES, eiaSeriesId } from '@/data/geo';

export type AppEvent = {
  install_id: string;
  session_id: string;
  name: string;
  props: Record<string, unknown>;
  platform: string;
  app_version: string;
  occurred_at: string;
  received_at: string;
};

export type IngestRun = {
  id: number;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'succeeded' | 'failed';
  rows_upserted: number;
  detail: unknown;
};

export function createStore() {
  const series: SeriesRef[] = ALL_SERIES.map(({ area, kind }) => ({
    area,
    kind,
    eia_series_id: eiaSeriesId(area, kind),
  }));
  const prices = new Map<string, WeeklyPrice>();
  const runs: IngestRun[] = [];
  const events: AppEvent[] = [];
  return {
    series,
    runs,
    events,
    upsertPrices(rows: WeeklyPrice[]) {
      for (const r of rows) prices.set(`${r.area}/${r.kind}/${r.period}`, r);
    },
    weekly(area: string, kind: string): WeeklyPrice[] {
      return [...prices.values()]
        .filter((p) => p.area === area && p.kind === kind)
        .sort((a, b) => a.period.localeCompare(b.period));
    },
    latestPeriod(): string | null {
      let max: string | null = null;
      for (const p of prices.values()) if (!max || p.period > max) max = p.period;
      return max;
    },
    priceCount: () => prices.size,
  };
}

export type Store = ReturnType<typeof createStore>;

const DAY = 86_400_000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;
const iso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Same contract as the SQL fuel_series_daily(): forward-filled days ending on the latest week. */
export function fuelSeriesDaily(store: Store, area: string, kind: string, days: number) {
  const weekly = store.weekly(area, kind);
  if (weekly.length === 0) return [];
  const last = day(weekly[weekly.length - 1]!.period);
  const first = Math.max(last - (days - 1), day(weekly[0]!.period));
  const out: { day: string; price_usd_per_gal: number }[] = [];
  let w = 0;
  for (let d = first; d <= last; d++) {
    while (w + 1 < weekly.length && day(weekly[w + 1]!.period) <= d) w++;
    out.push({ day: iso(d), price_usd_per_gal: weekly[w]!.price_usd_per_gal });
  }
  return out;
}
