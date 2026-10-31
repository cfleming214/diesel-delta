import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import { createRetailMock } from '../mock-server/retailMock';
import { mockAdapter } from './adapters/mock';
import type { SourceAdapter } from './adapters/types';
import { loadCatalog } from './catalog';
import { startInProcessMock, userAgent } from './cli';
import { createBotDb } from './db';
import {
  BlockedError,
  createPoliteHttp,
  DisabledError,
  DisallowedError,
  parseRobots,
  robotsAllows,
} from './http';
import { AUTO_APPROVE, matchCatalog, scoreMatch } from './match';
import { normalize, type RawOffer, validate } from './normalize';
import { runDay } from './pipeline';
import { memoryRawStore } from './raw';

const items = loadCatalog();
const byId = new Map(items.map((i) => [i.id, i]));
const UA = userAgent('https://example.test/bot');

/** A fetch stub that replays responses in order and records requests. */
function stubFetch(
  responses: { status: number; body?: string; headers?: Record<string, string> }[],
) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
    if (String(url).endsWith('/robots.txt'))
      return new Response('User-agent: *\nDisallow: /private\n');
    const r = responses.shift() ?? { status: 200, body: 'ok' };
    return new Response(r.body ?? '', { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { impl, calls };
}

const req = (path = '/products') => ({
  sourceId: 's',
  host: 'h',
  minIntervalMs: 1000,
  url: `https://shop.test${path}`,
  robotsUrl: 'https://shop.test/robots.txt',
});

describe('PoliteHttp', () => {
  test('robots.txt: our own group wins over *, longest rule wins, Allow wins ties', () => {
    const rules = parseRobots(
      [
        'User-agent: *',
        'Disallow: /',
        '',
        'User-agent: DieselDataPriceBot',
        'User-agent: otherbot',
        'Disallow: /cart',
        'Allow: /cart/public$',
        'Disallow: /*?session=',
      ].join('\n'),
      'DieselDataPriceBot',
    );
    assert.equal(robotsAllows(rules, '/products/1'), true);
    assert.equal(robotsAllows(rules, '/cart/1'), false);
    assert.equal(robotsAllows(rules, '/cart/public'), true);
    assert.equal(robotsAllows(rules, '/p?session=1'), false);
    assert.equal(
      robotsAllows(parseRobots('User-agent: *\nDisallow: /', 'DieselDataPriceBot'), '/x'),
      false,
    );
  });

  test('sends the User-Agent, spaces requests per host, and refuses disallowed paths', async () => {
    let clock = 0;
    const slept: number[] = [];
    const { impl, calls } = stubFetch([{ status: 200 }, { status: 200 }]);
    const http = createPoliteHttp({
      userAgent: UA,
      isEnabled: () => true,
      fetchImpl: impl,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    await Promise.all([http.get(req()), http.get(req())]);
    assert.deepEqual(slept, [1000], 'the second request waits one interval');
    assert.ok(calls.every((c) => c.headers['user-agent'] === UA));
    await assert.rejects(http.get(req('/private/x')), DisallowedError);
  });

  test('backs off on 429 using Retry-After, then succeeds', async () => {
    const slept: number[] = [];
    const { impl } = stubFetch([
      { status: 429, headers: { 'retry-after': '7' } },
      { status: 200, body: 'fine' },
    ]);
    const raw = memoryRawStore();
    const http = createPoliteHttp({
      userAgent: UA,
      isEnabled: () => true,
      fetchImpl: impl,
      raw,
      sleep: async (ms) => void slept.push(ms),
    });
    const res = await http.get({ ...req(), minIntervalMs: 0, rawKey: 'run/1' });
    assert.equal(res.body, 'fine');
    assert.ok(slept.includes(7000));
    assert.equal(raw.entries.get('run/1'), 'fine');
    assert.equal(http.counts.retries, 1);
  });

  test('gives up after the last attempt on server errors', async () => {
    const { impl } = stubFetch([{ status: 503 }, { status: 503 }, { status: 503 }]);
    const http = createPoliteHttp({
      userAgent: UA,
      isEnabled: () => true,
      fetchImpl: impl,
      sleep: async () => {},
    });
    await assert.rejects(
      http.get({ ...req(), minIntervalMs: 0 }),
      /HTTP 503 from h after 3 attempts/,
    );
  });

  test('a 403 or a challenge page is a block, never retried', async () => {
    for (const r of [
      { status: 403 },
      { status: 200, body: '<title>Please verify you are a human</title>' },
    ]) {
      const { impl, calls } = stubFetch([r]);
      const http = createPoliteHttp({
        userAgent: UA,
        isEnabled: () => true,
        fetchImpl: impl,
        sleep: async () => {},
      });
      await assert.rejects(http.get({ ...req(), minIntervalMs: 0 }), BlockedError);
      assert.equal(calls.filter((c) => !c.url.endsWith('robots.txt')).length, 1);
    }
  });

  test('the kill switch stops requests', async () => {
    const { impl, calls } = stubFetch([]);
    const http = createPoliteHttp({ userAgent: UA, isEnabled: () => false, fetchImpl: impl });
    await assert.rejects(http.get(req()), DisabledError);
    assert.equal(calls.filter((c) => !c.url.endsWith('robots.txt')).length, 0);
  });
});

describe('matching', () => {
  test('auto-approves the right item for every mock product and never a decoy', () => {
    const mock = createRetailMock(items);
    for (const r of ['kroger', 'walmart', 'amazon'] as const) {
      const truth = new Map(mock.products[r].map((p) => [p.sku, p.itemId]));
      const approved = matchCatalog(items, mock.products[r]).filter((m) => m.status === 'approved');
      const wrong = approved.filter((m) => truth.get(m.product.sku) !== m.match.itemId);
      assert.deepEqual(
        wrong.map((m) => m.product.title),
        [],
        `${r} wrong matches`,
      );
      const real = mock.products[r].filter((p) => p.itemId).length;
      assert.ok(approved.length / real >= 0.95, `${r} recall ${approved.length}/${real}`);
    }
  });

  test('variants, brands and pack sizes', () => {
    const p = (title: string, size: string, brand = 'Kroger') => ({ sku: 'x', title, brand, size });
    assert.equal(scoreMatch(byId.get('beef')!, p('Kroger Ground Beef 93/7', 'per lb')), 0);
    assert.equal(
      scoreMatch(byId.get('milk')!, p('Great Value Whole Milk', '1 gal', 'Great Value')),
      1,
    );
    assert.ok(
      scoreMatch(byId.get('milk')!, p('Kroger Organic Whole Milk', '1 gal')) < AUTO_APPROVE,
    );
    assert.equal(
      scoreMatch(byId.get('ketchup')!, p('Hunt’s Tomato Ketchup', '32 oz', 'Hunt’s')),
      0,
    );
    assert.equal(scoreMatch(byId.get('ketchup')!, p('Heinz Tomato Ketchup', '32 oz', 'Heinz')), 1);
    assert.equal(scoreMatch(byId.get('ketchup')!, p('Heinz Tomato Ketchup', '20 oz', 'Heinz')), 0);
    assert.equal(scoreMatch(byId.get('rice')!, p('Kroger Long-Grain Rice Value Pack', '15 lb')), 0);
  });
});

describe('normalize and validate', () => {
  const offer = (o: Partial<RawOffer>): RawOffer => ({
    sku: 's',
    gtin: null,
    title: 't',
    brand: null,
    size: '32 oz',
    regular: 4.79,
    promo: null,
    member: null,
    inStock: true,
    ...o,
  });
  const ketchup = byId.get('ketchup')!;

  test('unit prices, per-lb items and promo tracking', () => {
    const n = normalize(ketchup, offer({ promo: 3.99 }))!;
    assert.equal(n.promoPrice, 3.99);
    assert.ok(Math.abs(n.unitPrice - 4.79 / (32 * 28.349523125)) < 1e-12);
    assert.equal(normalize(ketchup, offer({ promo: 4.79 }))!.promoPrice, null, 'not below regular');
    assert.equal(
      normalize(byId.get('bananas')!, offer({ size: 'per lb', regular: 0.62 }))!.size.unit,
      'lb',
    );
    assert.equal(normalize(ketchup, offer({ size: 'family size' })), null);
    assert.equal(normalize(ketchup, offer({ size: '32 fl oz' })), null, 'volume is not weight');
  });

  test('holds out-of-band prices and big jumps; flags size changes', () => {
    const n = normalize(ketchup, offer({}))!;
    assert.deepEqual(validate(ketchup, n, null), { kind: 'publish', sizeChange: null });
    const glitch = normalize(ketchup, offer({ regular: 47.9 }))!;
    assert.equal(validate(ketchup, glitch, null).kind, 'hold');
    const jump = validate(ketchup, normalize(ketchup, offer({ regular: 7.49 }))!, {
      regularPrice: 4.79,
      size: { qty: 32, unit: 'oz' },
    });
    assert.equal(jump.kind === 'hold' && jump.reason, 'price_jump');
    const shrunk = validate(ketchup, normalize(ketchup, offer({ size: '30 oz' }))!, {
      regularPrice: 4.79,
      size: { qty: 32, unit: 'oz' },
    });
    assert.deepEqual(shrunk, {
      kind: 'publish',
      sizeChange: { from: { qty: 32, unit: 'oz' }, to: { qty: 30, unit: 'oz' } },
    });
  });
});

describe('daily run against the mock server', () => {
  let mock: Awaited<ReturnType<typeof startInProcessMock>>;
  let db: ReturnType<typeof createBotDb>;
  let adapters: SourceAdapter[];
  const http = () =>
    createPoliteHttp({ userAgent: UA, isEnabled: (id) => db.isEnabled(id), raw: memoryRawStore() });

  before(async () => {
    mock = await startInProcessMock();
    db = createBotDb(mock.url, 'mock-service-role-key', { killSwitchTtlMs: 0 });
    adapters = (['kroger', 'walmart', 'amazon'] as const).map((retailerId) =>
      mockAdapter({ retailerId, baseUrl: mock.url, minIntervalMs: 0 }),
    );
  });
  after(() => mock.stop());

  test('prices every carried item at every store, and re-running a day updates in place', async () => {
    const s = await runDay({ db, http: http(), adapters, items, day: '2026-10-11' });
    assert.equal(s.status, 'succeeded');
    assert.ok(s.coverage.pct >= 95, `coverage ${s.coverage.pct}%`);
    assert.equal(s.sources['mock-kroger']!.tasks, 30, '10 stores × 3 batches');
    assert.equal(s.sources['mock-amazon']!.tasks, 3, 'online: 3 batches');
    const count = (await db.observations('2026-10-11', '2026-10-12')).length;
    assert.ok(count > 2900, `observations ${count}`);

    await runDay({ db, http: http(), adapters, items, day: '2026-10-11' });
    assert.equal((await db.observations('2026-10-11', '2026-10-12')).length, count);

    const stores = await db.stores();
    assert.equal(stores.length, 20);
    const online = (await db.observations('2026-10-11', '2026-10-12')).filter(
      (o) => o.store_id === null,
    );
    assert.ok(online.every((o) => o.retailer_id === 'amazon'));
  });

  test('detects a shrinking package the next day', async () => {
    const s = await runDay({ db, http: http(), adapters, items, day: '2026-10-12' });
    assert.ok(s.sizeChanges >= 10, `size changes ${s.sizeChanges}`);
    const events = await db.events('2026-10-12', '2026-10-13');
    const chips = events.filter((e) => e.item_id === 'chips' && e.retailer_id === 'kroger');
    assert.ok(
      chips.length > 0 && chips.every((e) => e.kind === 'size_change' && e.tag === '8 oz → 7.5 oz'),
    );
  });

  test('carries prices between consecutive runs without re-reading them', async () => {
    const carry = new Map();
    await runDay({ db, http: http(), adapters, items, day: '2026-10-04', carry });
    assert.ok(carry.size > 2900, `carried ${carry.size}`);
    // Ice cream shrinks at Amazon on 2026-10-05; the carried size catches it.
    const s = await runDay({ db, http: http(), adapters, items, day: '2026-10-05', carry });
    assert.equal(s.sizeChanges, 1);
    // Everything published today replaces the carried price; held prices keep the earlier one.
    const today = [...carry.values()].filter((p) => p.day === '2026-10-05').length;
    assert.ok(today >= carry.size - 10 && today < carry.size + 1, `${today} of ${carry.size}`);
  });

  test('skips a disabled source', async () => {
    await db.disableSource('mock-amazon', 'test');
    const s = await runDay({ db, http: http(), adapters, items, day: '2026-10-13' });
    assert.equal(s.sources['mock-amazon'], undefined);
    assert.equal(s.coverage.possible, 300);
    await db.client.from('sources').update({ enabled: true }).eq('id', 'mock-amazon');
  });

  test('a blocked source is disabled instead of retried', async () => {
    const blocker = createServer((q, r) => {
      if (q.url === '/robots.txt') return void r.end('User-agent: *\nAllow: /\n');
      r.writeHead(403).end('Forbidden');
    });
    await new Promise<void>((r) => blocker.listen(0, r));
    const port = (blocker.address() as AddressInfo).port;
    const walmart = adapters.find((a) => a.sourceId === 'mock-walmart')!;
    const blocked: SourceAdapter = {
      ...walmart,
      fetchOffers: async (_t, ctx) => {
        await ctx.http.get({
          sourceId: walmart.sourceId,
          host: 'blocker',
          minIntervalMs: 0,
          url: `http://127.0.0.1:${port}/products`,
          robotsUrl: `http://127.0.0.1:${port}/robots.txt`,
        });
        return { offers: [], rawRef: null };
      },
    };
    try {
      const s = await runDay({
        db,
        http: http(),
        adapters: [blocked],
        items,
        day: '2026-10-14',
        workers: 1,
      });
      const w = s.sources['mock-walmart']!;
      assert.match(w.blocked ?? '', /HTTP 403/);
      assert.equal(w.failedTasks, w.tasks, 'remaining tasks stop once the source is disabled');
      assert.equal(await db.isEnabled('mock-walmart'), false);
    } finally {
      blocker.closeAllConnections();
      await new Promise<void>((r) => blocker.close(() => r()));
      await db.client.from('sources').update({ enabled: true }).eq('id', 'mock-walmart');
    }
  });
});
