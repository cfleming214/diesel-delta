// Supabase-compatible mock backend: the subset of PostgREST and Edge Functions the app uses.
import type { IncomingMessage, ServerResponse } from 'node:http';

import { EVENT_NAMES as APP_EVENT_NAMES } from '@/domain/events';

import { createHandler, type IngestDb } from '../supabase/functions/ingest-eia/handler.ts';
import { eiaResponse } from './eiaMock';
import { createMetrics, type Metrics } from './metrics';
import { createStore, fuelSeriesDaily, type AppEvent, type Store } from './store';

export type MockOptions = {
  /** Added to every response: base + random jitter, in ms. */
  latencyMs?: number;
  jitterMs?: number;
  /** Fraction of data requests (0–1) that fail with 503, for resilience testing. */
  errorRate?: number;
  ingestSecret?: string;
  random?: () => number;
};

/** Event names the app may send (shared with the app and the app_events check constraint). */
export const EVENT_NAMES = new Set<string>(APP_EVENT_NAMES);

const MAX_EVENTS_PER_REQUEST = 100;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, apikey, content-type, prefer, x-client-info, x-ingest-secret',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
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

  const db: IngestDb = {
    listSeries: async () => store.series,
    latestPeriod: async () => store.latestPeriod(),
    upsertPrices: async (rows) => store.upsertPrices(rows),
    startRun: async () => {
      const id = store.runs.length + 1;
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
      Object.assign(store.runs[id - 1]!, {
        status,
        rows_upserted: rows,
        detail,
        finished_at: new Date().toISOString(),
      });
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
      if (req.method !== 'OPTIONS') {
        metrics.record({
          at: Date.now(),
          route: `${req.method} ${path}`,
          status,
          ms: performance.now() - started,
        });
      }
    }
  }

  return { handle, store, metrics, runIngest, ingestSecret };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
