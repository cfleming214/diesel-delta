import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import { createClient } from '@supabase/supabase-js';

import { createMockBackend } from './app';
import { createRetailMock } from './retailMock';

let url = '';
let backend: ReturnType<typeof createMockBackend>;
const server = createServer((req, res) => void backend.handle(req, res));

before(async () => {
  backend = createMockBackend({ retailRateLimit: 20 });
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const get = async (path: string) => {
  const res = await fetch(`${url}${path}`);
  return { status: res.status, body: (await res.json().catch(() => null)) as never };
};

describe('mock retailers', () => {
  const mock = createRetailMock();

  test('carry most of the catalog, plus decoys that are not catalog items', () => {
    for (const r of ['kroger', 'walmart', 'amazon'] as const) {
      const real = mock.products[r].filter((p) => p.itemId);
      assert.ok(real.length >= 140 && real.length < 150, `${r} carries ${real.length}`);
      assert.ok(
        mock.products[r].some((p) => !p.itemId),
        `${r} has decoys`,
      );
    }
  });

  test('prices are deterministic per day and change over time', () => {
    const skus = mock.products.kroger.slice(0, 50).map((p) => p.sku);
    const a = mock.offers('kroger', skus, '034-00178', '2026-06-01');
    const b = mock.offers('kroger', skus, '034-00178', '2026-06-01');
    const c = mock.offers('kroger', skus, '034-00178', '2026-10-30');
    assert.deepEqual(a, b);
    assert.ok(
      a.some((o, i) => o.price.regular !== c[i]!.price.regular),
      'some prices change in five months',
    );
    for (const o of c) {
      if (o.price.promo !== null) assert.ok(o.price.promo < o.price.regular);
    }
  });

  test('stores in pricier regions charge more on average', () => {
    const skus = mock.products.walmart.map((p) => p.sku);
    const avg = (loc: string) => {
      const offers = mock.offers('walmart', skus, loc, '2026-10-30');
      return offers.reduce((s, o) => s + o.price.regular, 0) / offers.length;
    };
    assert.ok(avg('W5643') > avg('W0471'), 'Los Angeles above Houston');
  });

  test('a shrinking product keeps its SKU and gets a smaller size', () => {
    const chips = mock.products.kroger.find((p) => p.itemId === 'chips')!;
    const [before] = mock.offers('kroger', [chips.sku], '034-00178', '2026-10-11');
    const [after] = mock.offers('kroger', [chips.sku], '034-00178', '2026-10-12');
    assert.equal(before!.size, '8 oz');
    assert.equal(after!.size, '7.5 oz');
  });

  test('HTTP: robots.txt, locations, paged catalog without the answer key, and offers', async () => {
    const robots = await fetch(`${url}/retail-mock/kroger/robots.txt`);
    assert.match(await robots.text(), /Disallow: \/retail-mock\/kroger\/checkout/);

    const locations = await get('/retail-mock/kroger/locations');
    assert.equal((locations.body as { data: unknown[] }).data.length, 10);
    const amazon = await get('/retail-mock/amazon/locations');
    assert.deepEqual((amazon.body as { data: unknown[] }).data, [], 'Amazon is online only');

    const page = await get('/retail-mock/walmart/catalog?offset=0&limit=50');
    const { data, total } = page.body as { data: Record<string, unknown>[]; total: number };
    assert.equal(data.length, 50);
    assert.ok(total > 150);
    assert.ok(
      data.every((p) => !('itemId' in p)),
      'the catalog must not reveal the item mapping',
    );

    const sku = data[0]!.sku as string;
    const ok = await get(
      `/retail-mock/walmart/products?skus=${sku}&locationId=W0471&date=2026-10-30`,
    );
    assert.equal(ok.status, 200);
    assert.equal((await get(`/retail-mock/walmart/products?skus=${sku}`)).status, 400);
    assert.equal((await get(`/retail-mock/amazon/products?skus=AM1&locationId=x`)).status, 400);
    const many = Array.from({ length: 51 }, (_, i) => `S${i}`).join(',');
    assert.equal((await get(`/retail-mock/kroger/products?skus=${many}&locationId=x`)).status, 400);
  });

  test('HTTP: answers 429 past the configured rate', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 30 }, () =>
        fetch(`${url}/retail-mock/amazon/robots.txt`).then((r) => r.status),
      ),
    );
    assert.ok(statuses.includes(429));
  });
});

describe('PostgREST subset for the price bot', () => {
  const service = () => createClient(url, 'mock-service-role-key');
  const anon = () => createClient(url, 'mock-anon-key');

  test('private tables need the service role; public ones are readable', async () => {
    const denied = await anon().from('sources').select('*');
    assert.ok(denied.error);
    const write = await anon().from('items').insert({ id: 'x' });
    assert.ok(write.error);
    const retailers = await anon().from('retailers').select('*');
    assert.equal(retailers.data?.length, 6);
  });

  test('upserts on the natural key, treating nulls as equal, and returns rows', async () => {
    const db = service();
    const stores = await db
      .from('stores')
      .upsert(
        [
          {
            retailer_id: 'kroger',
            external_id: 'A',
            name: 'A',
            zip: '77002',
            state: 'TX',
            padd: 'gulf',
          },
        ],
        { onConflict: 'retailer_id,external_id' },
      )
      .select();
    assert.equal(stores.error, null);
    const storeId = stores.data![0]!.id as number;

    const row = (price: number, store_id: number | null) => ({
      item_id: 'milk',
      retailer_id: 'kroger',
      store_id,
      day: '2026-10-30',
      source_id: 'mock-kroger',
      regular_price: price,
    });
    const conflict = 'item_id,retailer_id,store_id,day,source_id';
    await db
      .from('price_observations')
      .upsert([row(3.89, storeId), row(3.79, null)], { onConflict: conflict });
    await db
      .from('price_observations')
      .upsert([row(3.99, storeId), row(3.69, null)], { onConflict: conflict });

    const all = await db
      .from('price_observations')
      .select('*')
      .order('regular_price', { ascending: true });
    assert.deepEqual(
      all.data?.map((r) => r.regular_price),
      [3.69, 3.99],
    );
    const online = await anon()
      .from('price_observations')
      .select('*')
      .is('store_id', null)
      .single();
    assert.equal(online.data?.regular_price, 3.69);
  });

  test('filters, paging, update and the task claim RPC', async () => {
    const db = service();
    const run = await db.from('ingest_runs').insert({ job: 'price-bot' }).select('id').single();
    const runId = run.data!.id as number;
    await db.from('price_tasks').insert(
      [1, 2, 3, 4].map((n) => ({
        run_id: runId,
        source_id: 'mock-kroger',
        host: 'm',
        payload: { n },
      })),
    );
    const first = await db.rpc('claim_price_tasks', { p_run_id: runId, p_limit: 3 });
    assert.deepEqual(
      (first.data as { payload: { n: number } }[]).map((t) => t.payload.n),
      [1, 2, 3],
    );
    const second = await db.rpc('claim_price_tasks', { p_run_id: runId, p_limit: 3 });
    assert.equal((second.data as unknown[]).length, 1);

    await db.from('price_tasks').update({ state: 'done' }).eq('run_id', runId).in('id', [1, 2]);
    const done = await db.from('price_tasks').select('*').eq('state', 'done');
    assert.equal(done.data?.length, 2);
    const paged = await db.from('price_tasks').select('*').order('id').range(1, 2);
    assert.deepEqual(
      paged.data?.map((t) => t.id),
      [2, 3],
    );
    assert.ok((await anon().rpc('claim_price_tasks', { p_run_id: runId, p_limit: 1 })).error);

    const finished = await db.from('ingest_runs').update({ status: 'succeeded' }).eq('id', runId);
    assert.equal(finished.error, null);
    assert.equal(backend.store.runs.find((r) => r.id === runId)?.status, 'succeeded');
  });
});
