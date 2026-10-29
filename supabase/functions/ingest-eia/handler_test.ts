import assert from 'node:assert/strict';

import type { SeriesRef, WeeklyPrice } from '../_shared/eia.ts';
import { createHandler, type IngestDb } from './handler.ts';

const SERIES: SeriesRef[] = [{
  area: 'R30',
  kind: 'diesel',
  eia_series_id: 'EMD_EPD2D_PTE_R30_DPG',
}];

function fakeDb(latest: string | null = null) {
  const calls = { upserts: [] as WeeklyPrice[][], runs: [] as unknown[][] };
  const db: IngestDb = {
    listSeries: async () => SERIES,
    latestPeriod: async () => latest,
    upsertPrices: async (rows) => void calls.upserts.push(rows),
    startRun: async () => 7,
    finishRun: async (...args) => void calls.runs.push(args),
  };
  return { db, calls };
}

const post = (secret?: string) =>
  new Request('http://localhost/ingest-eia', {
    method: 'POST',
    headers: secret ? { 'x-ingest-secret': secret } : {},
  });

const eiaPage = {
  response: {
    total: 1,
    data: [{ period: '2026-10-26', series: 'EMD_EPD2D_PTE_R30_DPG', value: '3.41' }],
  },
};

Deno.test('rejects GET and requests without the ingest secret', async () => {
  const { db } = fakeDb();
  const handle = createHandler({
    db,
    eiaApiKey: 'k',
    ingestSecret: 's3cret',
    fetchJson: async () => eiaPage,
  });
  assert.equal((await handle(new Request('http://localhost/ingest-eia'))).status, 405);
  assert.equal((await handle(post())).status, 401);
  assert.equal((await handle(post('wrong!'))).status, 401);
});

Deno.test('fetches from four weeks before the latest week, upserts and logs the run', async () => {
  const { db, calls } = fakeDb('2026-10-19');
  let url = '';
  const handle = createHandler({
    db,
    eiaApiKey: 'k',
    ingestSecret: 's3cret',
    fetchJson: async (u) => ((url = u), eiaPage),
  });
  const res = await handle(post('s3cret'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { rows: 1, start: '2026-09-21', skipped: 0, missing: [] });
  assert.equal(new URL(url).searchParams.get('start'), '2026-09-21');
  assert.deepEqual(calls.upserts, [
    [{ area: 'R30', kind: 'diesel', period: '2026-10-26', price_usd_per_gal: 3.41 }],
  ]);
  assert.deepEqual(calls.runs, [[7, 'succeeded', 1, {
    start: '2026-09-21',
    skipped: 0,
    missing: [],
  }]]);
});

Deno.test('EIA failures are logged and return 502', async () => {
  const { db, calls } = fakeDb();
  const handle = createHandler({
    db,
    eiaApiKey: 'k',
    ingestSecret: 's3cret',
    fetchJson: async () => {
      throw new Error('EIA HTTP 503');
    },
  });
  const res = await handle(post('s3cret'));
  assert.equal(res.status, 502);
  assert.deepEqual(calls.runs, [[7, 'failed', 0, { error: 'EIA HTTP 503' }]]);
  assert.equal(calls.upserts.length, 0);
});
