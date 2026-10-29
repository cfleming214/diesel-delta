import assert from 'node:assert/strict';

import { buildEiaUrl, fetchWeeklyPrices, parseEiaPage, type SeriesRef, startDate } from './eia.ts';

const SERIES: SeriesRef[] = [
  { area: 'R30', kind: 'diesel', eia_series_id: 'EMD_EPD2D_PTE_R30_DPG' },
  { area: 'SCA', kind: 'diesel', eia_series_id: 'EMD_EPD2D_PTE_SCA_DPG' },
];

// Shape of an EIA API v2 /petroleum/pri/gnd/data response (values arrive as strings or numbers).
const page = (data: unknown[], total = data.length) => ({
  response: { total, dateFormat: 'YYYY-MM-DD', frequency: 'weekly', data },
  apiVersion: '2.1.8',
});
const row = (series: string, period: string, value: unknown) => ({
  period,
  duoarea: series.split('_')[3],
  product: 'EPD2D',
  series,
  value,
  units: '$/GAL',
});

Deno.test('buildEiaUrl encodes series facets, start, sort and paging', () => {
  const url = new URL(
    buildEiaUrl({ apiKey: 'k', seriesIds: ['A', 'B'], start: '2024-01-01', offset: 10 }),
  );
  assert.equal(url.origin + url.pathname, 'https://api.eia.gov/v2/petroleum/pri/gnd/data/');
  assert.deepEqual(url.searchParams.getAll('facets[series][]'), ['A', 'B']);
  assert.equal(url.searchParams.get('frequency'), 'weekly');
  assert.equal(url.searchParams.get('data[0]'), 'value');
  assert.equal(url.searchParams.get('start'), '2024-01-01');
  assert.equal(url.searchParams.get('offset'), '10');
  assert.equal(url.searchParams.get('length'), '5000');
});

Deno.test('parseEiaPage maps rows and skips bad ones', () => {
  const parsed = parseEiaPage(
    page([
      row('EMD_EPD2D_PTE_R30_DPG', '2026-10-26', '3.41'),
      row('EMD_EPD2D_PTE_SCA_DPG', '2026-10-26', 5.1234),
      row('EMD_EPD2D_PTE_R30_DPG', '2026-10-19', null),
      row('EMD_EPD2D_PTE_ZZZ_DPG', '2026-10-26', '3.00'),
      row('EMD_EPD2D_PTE_R30_DPG', '10/12/2026', '3.50'),
    ]),
    SERIES,
  );
  assert.deepEqual(parsed.rows, [
    { area: 'R30', kind: 'diesel', period: '2026-10-26', price_usd_per_gal: 3.41 },
    { area: 'SCA', kind: 'diesel', period: '2026-10-26', price_usd_per_gal: 5.123 },
  ]);
  assert.deepEqual(
    parsed.skipped.map((s) => s.reason),
    ['missing value', 'unknown series', 'bad period'],
  );
});

Deno.test('parseEiaPage rejects error envelopes', () => {
  assert.throws(() => parseEiaPage({ error: 'API_KEY_INVALID' }, SERIES), /API_KEY_INVALID/);
  assert.throws(() => parseEiaPage(null, SERIES), /Unexpected EIA response/);
});

Deno.test('fetchWeeklyPrices pages until total and reports missing series', async () => {
  const urls: string[] = [];
  const pages = [
    page([
      row('EMD_EPD2D_PTE_R30_DPG', '2026-10-12', '3.50'),
      row('EMD_EPD2D_PTE_R30_DPG', '2026-10-19', '3.45'),
    ], 3),
    page([row('EMD_EPD2D_PTE_R30_DPG', '2026-10-26', '3.41')], 3),
  ];
  const result = await fetchWeeklyPrices({
    apiKey: 'k',
    series: SERIES,
    start: '2026-10-01',
    pageSize: 2,
    fetchJson: async (url) => {
      urls.push(url);
      return pages[urls.length - 1];
    },
  });
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1]!).searchParams.get('offset'), '2');
  assert.deepEqual(
    result.rows.map((r) => r.period),
    ['2026-10-12', '2026-10-19', '2026-10-26'],
  );
  assert.deepEqual(
    result.missing.map((s) => s.area),
    ['SCA'],
  );
});

Deno.test('startDate backfills three years, or re-reads the last four weeks', () => {
  const today = new Date('2026-10-29T12:00:00Z');
  assert.equal(startDate(null, today), '2023-10-29');
  assert.equal(startDate('2026-10-26', today), '2026-09-28');
});
