// Supabase-compatible mock backend: the subset of PostgREST and Edge Functions the app uses.
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

import { EVENT_NAMES as APP_EVENT_NAMES } from '@/domain/events';

import { computeMetrics } from '../supabase/functions/_shared/metrics.ts';
import { createHandler, type IngestDb } from '../supabase/functions/ingest-eia/handler.ts';
import { eiaResponse } from './eiaMock';
import { createMetrics, type Metrics } from './metrics';
import {
  basketDaily,
  claimPriceTasks,
  createTables,
  handleRest,
  itemPricesOn,
  RestError,
  type Row,
} from './rest';
import { createRetailMock, isMockRetailer } from './retailMock';
import { createStore, fuelSeriesDaily, type AppEvent, type Store } from './store';

export type MockOptions = {
  /** Added to every response: base + random jitter, in ms. */
  latencyMs?: number;
  jitterMs?: number;
  /** Fraction of data requests (0–1) that fail with 503, for resilience testing. */
  errorRate?: number;
  ingestSecret?: string;
  /** Token for the admin dashboard API (header x-admin-token or ?token=). */
  adminToken?: string;
  /** How often the live stream pushes a snapshot. */
  streamIntervalMs?: number;
  /** Key that grants service-role access (writes and private tables), like Supabase's. */
  serviceKey?: string;
  /** Requests per second each mock retailer allows before answering 429. Unlimited if unset. */
  retailRateLimit?: number;
  random?: () => number;
};

/** Event names the app may send (shared with the app and the app_events check constraint). */
export const EVENT_NAMES = new Set<string>(APP_EVENT_NAMES);

const MAX_EVENTS_PER_REQUEST = 100;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, apikey, content-type, prefer, x-client-info, x-ingest-secret',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    ...CORS,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new Error('payload too large');
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockBackend(opts: MockOptions = {}) {
  const store: Store = createStore();
  const metrics: Metrics = createMetrics();
  const random = opts.random ?? Math.random;
  const ingestSecret = opts.ingestSecret ?? 'mock-ingest-secret';
  const adminToken = opts.adminToken ?? 'mock-admin';
  const streamMs = opts.streamIntervalMs ?? 2000;
  const serviceKey = opts.serviceKey ?? 'mock-service-role-key';
  const tables = createTables(store.runs as unknown as Row[]);
  const retail = createRetailMock();
  const retailHits = new Map<string, number[]>();

  const snapshot = () =>
    computeMetrics({ events: store.events, requests: metrics.requests, runs: store.runs });

  const db: IngestDb = {
    listSeries: async () => store.series,
    latestPeriod: async () => store.latestPeriod(),
    upsertPrices: async (rows) => store.upsertPrices(rows),
    startRun: async () => {
      const id = store.runs.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      store.runs.push({
        id,
        job: 'ingest-eia',
        started_at: new Date().toISOString(),
        finished_at: null,
        status: 'running',
        rows_upserted: 0,
        detail: null,
      });
      return id;
    },
    finishRun: async (id, status, rows, detail) => {
      Object.assign(
        store.runs.find((r) => r.id === id)!,
        {
          status,
          rows_upserted: rows,
          detail,
          finished_at: new Date().toISOString(),
        },
      );
    },
  };
  const ingest = createHandler({ db, eiaApiKey: 'mock', ingestSecret, fetchJson: eiaResponse });

  /** Runs ingest-eia in-process (used at startup so the RPC has data). */
  async function runIngest() {
    const res = await ingest(
      new Request('http://mock/functions/v1/ingest-eia', {
        method: 'POST',
        headers: { 'x-ingest-secret': ingestSecret },
      }),
    );
    return res.json();
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<number> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (req.method === 'OPTIONS') {
      // Like the Supabase gateway, allow whatever headers the browser asks for (supabase-js sends
      // Content-Profile and Accept-Profile as well as apikey and authorization).
      const asked = req.headers['access-control-request-headers'];
      res.writeHead(204, {
        ...CORS,
        ...(typeof asked === 'string' ? { 'access-control-allow-headers': asked } : {}),
      });
      res.end();
      return 204;
    }
    if (path === '/health') return (send(res, 200, { ok: true, prices: store.priceCount() }), 200);

    if (req.method === 'GET' && (path === '/admin' || path === '/admin/')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(__dirname, 'admin', 'index.html')));
      return 200;
    }
    if (path.startsWith('/admin/api/')) {
      const token = req.headers['x-admin-token'] ?? url.searchParams.get('token');
      if (token !== adminToken) return (send(res, 401, { message: 'admin token required' }), 401);
      if (req.method === 'GET' && path === '/admin/api/metrics') {
        return (send(res, 200, snapshot()), 200);
      }
      if (req.method === 'GET' && path === '/admin/api/stream') {
        res.writeHead(200, {
          ...CORS,
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        const push = () => res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
        push();
        const timer = setInterval(push, streamMs);
        req.on('close', () => clearInterval(timer));
        return 200;
      }
    }

    // Simulated network + database time, and injected failures, on data routes only.
    if (path.startsWith('/rest/') || path.startsWith('/functions/')) {
      const ms = (opts.latencyMs ?? 0) + random() * (opts.jitterMs ?? 0);
      if (ms > 0) await sleep(ms);
      if (opts.errorRate && random() < opts.errorRate) {
        return (send(res, 503, { message: 'injected failure' }), 503);
      }
    }

    if (req.method === 'POST' && path === '/rest/v1/rpc/fuel_series_daily') {
      const body = (await readJson(req)) as { p_area?: string; p_kind?: string; p_days?: number };
      if (!body?.p_area || !body.p_kind || !body.p_days) {
        return (send(res, 400, { message: 'p_area, p_kind and p_days are required' }), 400);
      }
      return (send(res, 200, fuelSeriesDaily(store, body.p_area, body.p_kind, body.p_days)), 200);
    }

    if (req.method === 'POST' && path === '/rest/v1/app_events') {
      const body = await readJson(req);
      const rows = (Array.isArray(body) ? body : [body]) as Partial<AppEvent>[];
      if (
        rows.length > MAX_EVENTS_PER_REQUEST ||
        rows.some((r) => !r?.name || !EVENT_NAMES.has(r.name))
      ) {
        return (send(res, 400, { message: 'invalid events' }), 400);
      }
      const received_at = new Date().toISOString();
      for (const r of rows) {
        store.events.push({
          install_id: String(r.install_id ?? ''),
          session_id: String(r.session_id ?? ''),
          name: r.name!,
          props: (r.props ?? {}) as Record<string, unknown>,
          platform: String(r.platform ?? ''),
          app_version: String(r.app_version ?? ''),
          occurred_at: String(r.occurred_at ?? received_at),
          received_at,
        });
      }
      return (send(res, 201), 201);
    }

    if (path.startsWith('/retail-mock/')) return routeRetail(req, res, url);

    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const service = bearer === serviceKey || req.headers.apikey === serviceKey;

    if (req.method === 'POST' && path === '/rest/v1/rpc/claim_price_tasks') {
      if (!service) return (send(res, 401, { message: 'permission denied' }), 401);
      const body = (await readJson(req)) as { p_run_id?: number; p_limit?: number };
      return (
        send(res, 200, claimPriceTasks(tables, Number(body?.p_run_id), Number(body?.p_limit))),
        200
      );
    }

    if (req.method === 'POST' && path === '/rest/v1/rpc/item_prices_on') {
      const body = (await readJson(req)) as { p_days?: string[] };
      if (!Array.isArray(body?.p_days))
        return (send(res, 400, { message: 'p_days is required' }), 400);
      return (send(res, 200, itemPricesOn(tables, body.p_days)), 200);
    }
    if (req.method === 'POST' && path === '/rest/v1/rpc/basket_daily') {
      const b = (await readJson(req)) as {
        p_from?: string;
        p_to?: string;
        p_items?: string[];
        p_retailer?: string;
      };
      if (!b?.p_from || !b.p_to || !Array.isArray(b.p_items) || !b.p_retailer) {
        return (
          send(res, 400, { message: 'p_from, p_to, p_items and p_retailer are required' }),
          400
        );
      }
      return (send(res, 200, basketDaily(tables, b.p_from, b.p_to, b.p_items, b.p_retailer)), 200);
    }

    const table = path.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
    if (table && table in tables) {
      try {
        const out = handleRest(tables, {
          method: req.method ?? 'GET',
          table,
          params: url.searchParams,
          prefer: String(req.headers.prefer ?? ''),
          service,
          body: req.method === 'POST' || req.method === 'PATCH' ? await readJson(req) : undefined,
        });
        let body = out.body;
        if (String(req.headers.accept ?? '').includes('vnd.pgrst.object') && Array.isArray(body)) {
          if (body.length !== 1) {
            return (send(res, 406, { message: `expected 1 row, got ${body.length}` }), 406);
          }
          body = body[0];
        }
        res.writeHead(out.status, {
          ...CORS,
          ...out.headers,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        });
        res.end(body === undefined ? undefined : JSON.stringify(body));
        return out.status;
      } catch (e) {
        if (!(e instanceof RestError)) throw e;
        return (send(res, e.status, { message: e.message }), e.status);
      }
    }

    if (req.method === 'POST' && path === '/functions/v1/ingest-eia') {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (typeof v === 'string') headers.set(k, v);
      const out = await ingest(new Request(`http://mock${path}`, { method: 'POST', headers }));
      const status = out.status;
      return (send(res, status, await out.json()), status);
    }

    return (send(res, 404, { message: `No route for ${req.method} ${path}` }), 404);
  }

  /** Simulated retailers (see retailMock.ts): robots.txt, store locations, catalog and prices. */
  function routeRetail(req: IncomingMessage, res: ServerResponse, url: URL): number {
    const [, , retailer, ...rest] = url.pathname.split('/');
    const sub = rest.join('/');
    if (!retailer || !isMockRetailer(retailer) || req.method !== 'GET') {
      return (send(res, 404, { message: 'unknown retailer' }), 404);
    }
    if (opts.retailRateLimit) {
      const now = Date.now();
      const hits = (retailHits.get(retailer) ?? []).filter((t) => now - t < 1000);
      if (hits.length >= opts.retailRateLimit) {
        res.writeHead(429, { 'retry-after': '1', 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'rate limited' }));
        return 429;
      }
      retailHits.set(retailer, [...hits, now]);
    }
    if (sub === 'robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`User-agent: *\nDisallow: /retail-mock/${retailer}/checkout\n`);
      return 200;
    }
    if (sub === 'locations') {
      return (send(res, 200, { data: retail.stores[retailer] }), 200);
    }
    if (sub === 'catalog') {
      const all = retail.products[retailer];
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 50);
      const page = all.slice(offset, offset + limit).map(({ itemId: _hidden, ...p }) => p);
      return (send(res, 200, { data: page, total: all.length }), 200);
    }
    if (sub === 'products') {
      const skus = (url.searchParams.get('skus') ?? '').split(',').filter(Boolean);
      const locationId = url.searchParams.get('locationId');
      const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
      if (skus.length === 0 || skus.length > 50) {
        return (send(res, 400, { message: 'skus must list 1 to 50 products' }), 400);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return (send(res, 400, { message: 'bad date' }), 400);
      if (retailer === 'amazon' ? !!locationId : !locationId) {
        return (send(res, 400, { message: 'locationId is required for store prices only' }), 400);
      }
      try {
        return (send(res, 200, { data: retail.offers(retailer, skus, locationId, date) }), 200);
      } catch (e) {
        return (send(res, 404, { message: (e as Error).message }), 404);
      }
    }
    return (send(res, 404, { message: `No route for ${url.pathname}` }), 404);
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const started = performance.now();
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    let status = 500;
    try {
      status = await route(req, res);
    } catch (e) {
      status = e instanceof SyntaxError ? 400 : 500;
      if (!res.headersSent) send(res, status, { message: (e as Error).message });
    } finally {
      if (
        req.method !== 'OPTIONS' &&
        !path.startsWith('/admin') &&
        !path.startsWith('/retail-mock/') &&
        path !== '/health'
      ) {
        metrics.record({
          at: Date.now(),
          route: `${req.method} ${path}`,
          status,
          ms: performance.now() - started,
        });
      }
    }
  }

  return {
    handle,
    store,
    metrics,
    runIngest,
    ingestSecret,
    adminToken,
    serviceKey,
    snapshot,
    tables,
    retail,
  };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
