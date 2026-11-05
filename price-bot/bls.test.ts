import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import {
  blsPriceForSize,
  parseBlsUnit,
  parseData,
  parseItems,
  parseSeries,
  splitSeriesId,
} from './adapters/bls';
import { planBls, runBls } from './bls';
import { type CanonicalItem, loadCatalog } from './catalog';
import { startInProcessMock, userAgent } from './cli';
import { createBotDb } from './db';
import { createPoliteHttp } from './http';
import { memoryRawStore } from './raw';

const FIXTURES = join(__dirname, '..', 'mock-server', 'fixtures', 'bls');
const realItems = parseItems(readFileSync(join(FIXTURES, 'ap.item'), 'utf8'));
const realSeries = parseSeries(readFileSync(join(FIXTURES, 'ap.series'), 'utf8'));
// The BLS ingest is the one place that loads the fuel benchmarks too.
const catalog = loadCatalog({ benchmarks: true });
const item = (over: Partial<CanonicalItem>): CanonicalItem => ({ ...catalog[0]!, ...over });

describe('BLS files', () => {
  test('ap.series: padded IDs and CRLF; only U.S. and Census-region series are kept', () => {
    const text = [
      'series_id        \tarea_code\titem_code\tseries_title\tfootnote_codes\tbegin_year\tbegin_period\tend_year\tend_period',
      'APU0000709112    \t0000\t709112\tMilk in U.S. city average\t\t1995\tM07\t2026\tM09',
      'APU0100709112    \t0100\t709112\tMilk in Northeast\t\t1995\tM07\t2025\tM10',
      'APUS49A709112    \tS49A\t709112\tMilk in Los Angeles\t\t1995\tM07\t2026\tM09',
    ].join('\r\n');
    assert.deepEqual(parseSeries(text), [
      {
        id: 'APU0000709112',
        areaCode: '0000',
        itemCode: '709112',
        begin: '1995-07-01',
        end: '2026-09-01',
      },
      {
        id: 'APU0100709112',
        areaCode: '0100',
        itemCode: '709112',
        begin: '1995-07-01',
        end: '2025-10-01',
      },
    ]);
  });

  test('ap.data: wanted series only; missing values and non-monthly periods skipped', () => {
    const text = [
      'series_id        \tyear\tperiod\t       value\tfootnote_codes',
      'APU0000709112    \t2025\tM09\t       4.129\t',
      'APU0000709112    \t2025\tM10\t           -\tX',
      'APU0000709112    \t2025\tM13\t       4.100\t',
      'APU0000709112    \t2025\tM11\t       3.997\t',
      'APU0000708111    \t2025\tM11\t       3.500\t',
    ].join('\r\n');
    assert.deepEqual(parseData(text, new Set(['APU0000709112'])), [
      { seriesId: 'APU0000709112', month: '2025-09-01', price: 4.129 },
      { seriesId: 'APU0000709112', month: '2025-11-01', price: 3.997 },
    ]);
  });

  test('series IDs carry six-character food codes and five-character fuel codes', () => {
    assert.deepEqual(splitSeriesId('APU0000709112'), { areaCode: '0000', itemCode: '709112' });
    assert.deepEqual(splitSeriesId('APU00007471A'), { areaCode: '0000', itemCode: '7471A' });
    assert.deepEqual(splitSeriesId('APU040072610'), { areaCode: '0400', itemCode: '72610' });
    assert.equal(splitSeriesId('APU00007261'), null);
  });

  test('rejects a file that is not a BLS AP file (e.g. an error page)', () => {
    assert.throws(() => parseSeries('<html>Access Denied</html>'), /not a BLS AP file/);
  });
});

describe('BLS units', () => {
  test('reads each way BLS states a unit', () => {
    const cases: [string, ReturnType<typeof parseBlsUnit>][] = [
      ['Bacon, sliced, per lb. (453.6 gm)', { qty: 1, unit: 'lb' }],
      ['Rice, white (cost per pound/453.6 grams)', { qty: 1, unit: 'lb' }],
      ['Milk, fresh, whole, fortified, per gal. (3.8 lit)', { qty: 1, unit: 'gal' }],
      ['Ice cream, per 1/2 gal. (1.9 lit)', { qty: 0.5, unit: 'gal' }],
      ['Milk, per one-half gallon/1.9 liters', { qty: 0.5, unit: 'gal' }],
      ['Eggs, grade A, large, per doz.', { qty: 12, unit: 'ct' }],
      ['Strawberries, dry pint, per 12 oz. (340.2 gm)', { qty: 12, unit: 'oz' }],
      ['Orange juice, frozen concentrate, per 16 oz. (473.2 ml)', { qty: 16, unit: 'fl_oz' }],
      ['All soft drinks, 12 pk, 12 oz., cans, per 12 oz. (354.9 ml)', { qty: 12, unit: 'fl_oz' }],
      ['Potato chips, per 16 oz.', { qty: 16, unit: 'oz' }],
      ['All soft drinks, per 2 liters (67.6 oz)', { qty: 2, unit: 'l' }],
      ['Wine, red and white table, per 1 liter (33.8 oz)', { qty: 1, unit: 'l' }],
      ['Gasoline, unleaded regular, per gallon/3.785 liters', { qty: 1, unit: 'gal' }],
      ['Fuel oil #2 per gallon (3.785 liters)', { qty: 1, unit: 'gal' }],
      ['Electricity per KWH', { qty: 1, unit: 'kwh' }],
      ['Utility (piped) gas per therm', { qty: 1, unit: 'therm' }],
      ['Crude oil, per barrel', null],
    ];
    for (const [name, want] of cases) assert.deepEqual(parseBlsUnit(name), want, name);
  });

  test('scales a BLS price to a catalog size, or refuses across dimensions', () => {
    assert.equal(blsPriceForSize(1.02, { qty: 1, unit: 'lb' }, { qty: 5, unit: 'lb' }), 5.1);
    // Ice cream: $5.20 per 1/2 gal → a 48 fl oz tub.
    assert.equal(blsPriceForSize(5.2, { qty: 0.5, unit: 'gal' }, { qty: 48, unit: 'fl_oz' }), 3.9);
    assert.equal(blsPriceForSize(3, { qty: 1, unit: 'lb' }, { qty: 1, unit: 'each' }), null);
  });
});

describe('planBls', () => {
  test('every catalog mapping is a current national series in a compatible unit', () => {
    const plan = planBls(catalog, { items: realItems, series: realSeries });
    assert.deepEqual(plan.problems, []);
    assert.ok(catalog.filter((i) => i.blsSeriesId).length >= 55);
    // Fuels load from the same plan: every grade and utility, U.S. and all four regions.
    const fuels = plan.series.filter((s) => s.itemCode.length === 5);
    assert.equal(fuels.length, 40);
  });

  test('loads every region that has the item, and reports bad mappings', () => {
    const items = [
      item({ id: 'milk', blsSeriesId: 'APU0000709112', size: { qty: 1, unit: 'gal' } }),
      item({ id: 'ghost', blsSeriesId: 'APU0000999999' }),
      item({ id: 'old', blsSeriesId: 'APU0000701311', size: { qty: 1, unit: 'lb' } }),
      item({ id: 'lemon', blsSeriesId: 'APU0000711412', size: { qty: 1, unit: 'each' } }),
    ];
    const plan = planBls(items, { items: realItems, series: realSeries });
    assert.equal(plan.latestMonth, '2026-09-01');
    assert.deepEqual(
      plan.problems.map((p) => [p.itemId, p.kind]),
      [
        ['ghost', 'missing'],
        ['old', 'stale'],
        ['lemon', 'unit'],
      ],
    );
    const milk = plan.series.filter((s) => s.itemCode === '709112').map((s) => s.areaCode);
    assert.deepEqual(milk.sort(), ['0000', '0100', '0200', '0300', '0400']);
  });
});

describe('runBls against the mock', () => {
  let mock: Awaited<ReturnType<typeof startInProcessMock>>;
  let db: ReturnType<typeof createBotDb>;
  const http = () =>
    createPoliteHttp({
      userAgent: userAgent('https://example.test/bot'),
      isEnabled: (id) => db.isEnabled(id),
      raw: memoryRawStore(),
    });

  before(async () => {
    mock = await startInProcessMock();
    db = createBotDb(mock.url, 'mock-service-role-key', { killSwitchTtlMs: 0 });
  });
  after(() => mock.stop());

  const run = () =>
    runBls({ db, http: http(), items: catalog, baseUrl: `${mock.url}/bls-mock`, minIntervalMs: 0 });

  test('loads series and monthly prices, and re-running upserts', async () => {
    const first = await run();
    assert.equal(first.status, 'succeeded', first.error);
    assert.deepEqual(first.problems, []);
    assert.equal(first.latestMonth, '2026-09-01');
    assert.ok(first.series > first.current.nat!);
    assert.ok(first.prices > 10_000);

    const count = async (table: string) =>
      (await db.client.from(table).select('*', { count: 'exact', head: true })).count;
    assert.equal(await count('bls_prices'), first.prices);

    const second = await run();
    assert.equal(second.prices, first.prices);
    assert.equal(await count('bls_prices'), first.prices);

    const { data: milk } = await db.client
      .from('bls_series')
      .select('*')
      .eq('id', 'APU0000709112')
      .single();
    assert.equal(milk.unit, 'gal');
    assert.equal(milk.region, 'nat');
    // Fuels come from the Gasoline and Household Fuels files.
    const { data: power } = await db.client
      .from('bls_series')
      .select('*')
      .eq('id', 'APU000072610')
      .single();
    assert.equal(power.unit, 'kwh');
    const { count: gasMonths } = await db.client
      .from('bls_prices')
      .select('*', { count: 'exact', head: true })
      .eq('series_id', 'APU000074714');
    assert.ok(gasMonths! > 100, `regular gasoline months: ${gasMonths}`);
    const { data: gap } = await db.client
      .from('bls_prices')
      .select('*')
      .eq('series_id', 'APU0000709112')
      .eq('month', '2025-10-01');
    assert.deepEqual(gap, []);

    const runs = await db.runs('bls-ap');
    assert.equal(runs.at(-1)!.status, 'succeeded');
    assert.equal(runs.at(-1)!.rows_upserted, first.prices);
  });

  test('the kill switch stops it and the run is recorded as failed', async () => {
    await db.disableSource('bls-ap', 'test');
    const s = await run();
    assert.equal(s.status, 'failed');
    assert.match(s.error!, /disabled/);
    assert.equal((await db.runs('bls-ap')).at(-1)!.status, 'failed');
  });
});
