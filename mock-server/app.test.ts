import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import { createClient } from '@supabase/supabase-js';

import { createMockBackend, type MockBackend } from './app';

let server: Server;
let backend: MockBackend;
let base = '';

before(async () => {
  backend = createMockBackend();
  await backend.runIngest();
  server = createServer((req, res) => void backend.handle(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));

describe('mock backend', () => {
  test('ingest-eia (the production handler) loaded every series from the mock EIA feed', () => {
    const run = backend.store.runs[0]!;
    assert.equal(run.status, 'succeeded');
    assert.deepEqual((run.detail as { missing: string[] }).missing, []);
    // 30 series × 65 Mondays in the fixture window.
    assert.equal(backend.store.priceCount(), 30 * 65);
  });

  test('supabase-js rpc returns forward-filled daily prices', async () => {
    const supabase = createClient(base, 'mock-anon-key', { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc('fuel_series_daily', {
      p_area: 'R30',
      p_kind: 'diesel',
      p_days: 10,
    });
    assert.equal(error, null);
    const rows = data as { day: string; price_usd_per_gal: number }[];
    assert.equal(rows.length, 10);
    assert.equal(rows.at(-1)!.day, '2026-10-26');
    // Tuesday–Sunday carry the previous Monday's price.
    const byDay = Object.fromEntries(rows.map((r) => [r.day, r.price_usd_per_gal]));
    assert.equal(byDay['2026-10-25'], byDay['2026-10-19']);
    assert.notEqual(byDay['2026-10-26'], byDay['2026-10-19']);
  });

  test('a second ingest only re-reads recent weeks', async () => {
    const res = await fetch(`${base}/functions/v1/ingest-eia`, {
      method: 'POST',
      headers: { 'x-ingest-secret': backend.ingestSecret },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { start: string; rows: number };
    assert.equal(body.start, '2026-09-28');
    assert.equal(body.rows, 30 * 5);
    assert.equal((await fetch(`${base}/functions/v1/ingest-eia`, { method: 'POST' })).status, 401);
  });

  test('app_events accepts known events from supabase-js and rejects others', async () => {
    const supabase = createClient(base, 'mock-anon-key', { auth: { persistSession: false } });
    const ok = await supabase.from('app_events').insert([
      {
        install_id: 'i1',
        session_id: 's1',
        name: 'app_open',
        props: {},
        platform: 'ios',
        app_version: '1.0.0',
      },
    ]);
    assert.equal(ok.error, null);
    const bad = await supabase.from('app_events').insert([{ name: 'read_contacts' }]);
    assert.equal(bad.status, 400);
    assert.equal(backend.store.events.length, 1);
  });

  test('CORS preflight for the web build, 404 for unknown routes, metrics recorded', async () => {
    const pre = await fetch(`${base}/rest/v1/rpc/fuel_series_daily`, {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'apikey,content-profile,x-client-info' },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    assert.equal(
      pre.headers.get('access-control-allow-headers'),
      'apikey,content-profile,x-client-info',
    );
    assert.equal((await fetch(`${base}/rest/v1/nope`)).status, 404);
    assert.ok(
      backend.metrics.requests.some((r) => r.route === 'POST /rest/v1/rpc/fuel_series_daily'),
    );
  });

  test('error injection fails data routes but not health', async () => {
    const flaky = createMockBackend({ errorRate: 1 });
    const s = createServer((req, res) => void flaky.handle(req, res));
    await new Promise<void>((r) => s.listen(0, r));
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    try {
      assert.equal(
        (await fetch(`${url}/rest/v1/rpc/fuel_series_daily`, { method: 'POST' })).status,
        503,
      );
      assert.equal((await fetch(`${url}/health`)).status, 200);
    } finally {
      await new Promise<void>((r) => s.close(() => r()));
    }
  });
});
