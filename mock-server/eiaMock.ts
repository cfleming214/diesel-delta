// A stand-in for the EIA API v2 retail price endpoint, serving fixture prices in EIA's page format.
import { AREA_FIXTURE } from '@/data/fixtures/series';
import { fixtureApi } from '@/data/fixtureApi';
import { eiaSeriesId, type FuelArea } from '@/data/geo';
import { dateAtIndex, toISODate } from '@/domain';

type Row = {
  period: string;
  duoarea: string;
  product: string;
  series: string;
  value: string;
  units: string;
};

let cache: Row[] | null = null;

/** Weekly (Monday) observations for every series, built once from the fixture daily series. */
async function allRows(): Promise<Row[]> {
  if (cache) return cache;
  const rows: Row[] = [];
  for (const area of Object.keys(AREA_FIXTURE) as FuelArea[]) {
    for (const kind of ['diesel', 'gas'] as const) {
      const s = await fixtureApi.getFuelSeries(area, kind);
      s.values.forEach((v, i) => {
        const d = dateAtIndex(s.startDate, i);
        if (d.getDay() !== 1) return;
        rows.push({
          period: toISODate(d),
          duoarea: area,
          product: kind === 'diesel' ? 'EPD2D' : 'EPMR',
          series: eiaSeriesId(area, kind),
          value: v.toFixed(3),
          units: '$/GAL',
        });
      });
    }
  }
  rows.sort((a, b) => a.period.localeCompare(b.period) || a.series.localeCompare(b.series));
  cache = rows;
  return rows;
}

/** Answers a /v2/petroleum/pri/gnd/data request URL the way EIA does (facets, start, paging). */
export async function eiaResponse(url: string): Promise<unknown> {
  const params = new URL(url).searchParams;
  if (!params.get('api_key')) return { error: 'API_KEY_MISSING' };
  const series = new Set(params.getAll('facets[series][]'));
  const start = params.get('start') ?? '0000-00-00';
  const offset = Number(params.get('offset') ?? 0);
  const length = Number(params.get('length') ?? 5000);
  const matching = (await allRows()).filter(
    (r) => (series.size === 0 || series.has(r.series)) && r.period >= start,
  );
  return {
    response: {
      total: matching.length,
      dateFormat: 'YYYY-MM-DD',
      frequency: 'weekly',
      data: matching.slice(offset, offset + length),
    },
    apiVersion: '2.1.8-mock',
  };
}
