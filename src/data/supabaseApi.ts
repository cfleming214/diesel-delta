import { toISODate } from '@/domain';

import { fixtureApi } from './fixtureApi';
import { describeZip } from './geo/zip';
import { getSupabase } from './supabase';
import type { DataApi, DailySeries } from './types';

/** 12 months plus 12 weeks of lead-in for lag analysis (matches the fixture series length). */
export const SERIES_DAYS = 449;

/** Live fuel prices from Supabase (EIA). Grocery data stays on fixtures until a source is chosen. */
export const supabaseApi: DataApi = {
  ...fixtureApi,

  async getFuelSeries(area, kind) {
    const { data, error } = await getSupabase().rpc('fuel_series_daily', {
      p_area: area,
      p_kind: kind,
      p_days: SERIES_DAYS,
    });
    if (error) throw new Error(`Fuel prices could not be loaded: ${error.message}`);
    const rows = (data ?? []) as { day: string; price_usd_per_gal: number | string }[];
    if (rows.length === 0) throw new Error(`No fuel prices stored for ${area} ${kind}`);
    return { startDate: rows[0]!.day, values: rows.map((r) => Number(r.price_usd_per_gal)) };
  },

  async lookupZip(zip) {
    const place = describeZip(zip);
    const series = await supabaseApi.getFuelSeries(place.dieselSeries.area, 'diesel');
    const last = series.values.length - 1;
    const asOf = new Date(`${series.startDate}T00:00:00`);
    asOf.setDate(asOf.getDate() + last);
    return { ...place, currentDiesel: series.values[last]!, asOf: toISODate(asOf) };
  },

  /** Fixture basket values, re-dated to end today so they overlap the live fuel series. */
  async getBasketSeries(itemIds): Promise<DailySeries> {
    const { values } = await fixtureApi.getBasketSeries(itemIds);
    const start = new Date();
    start.setDate(start.getDate() - (values.length - 1));
    return { startDate: toISODate(start), values };
  },
};
