// The subset of PostgREST that the price bot uses through supabase-js, over in-memory tables that
// mirror supabase/migrations/20261031000000_price_bot.sql: select with eq/neq/gt/gte/lt/lte/in/is
// filters, order, limit and offset; insert; upsert on a conflict key (nulls equal, like the
// migration's `unique nulls not distinct`); and update.
export type Row = Record<string, unknown>;

type TableDef = {
  rows: Row[];
  /** Columns of the natural key used by upserts. */
  key?: string[];
  /** Generates an integer `id` on insert. */
  identity?: boolean;
  /** Clients without the service role may read it (RLS select policy); writes always need it. */
  publicRead: boolean;
  /** Row filter applied to public reads (e.g. approved identifiers only). */
  publicFilter?: (r: Row) => boolean;
  defaults?: () => Row;
};

export type Tables = ReturnType<typeof createTables>;

export function createTables(runs: Row[]) {
  const t = (def: Omit<TableDef, 'rows'> & { rows?: Row[] }): TableDef => ({
    rows: [],
    ...def,
  });
  const tables: Record<string, TableDef> = {
    retailers: t({
      key: ['id'],
      publicRead: true,
      rows: [
        { id: 'kroger', name: 'Kroger' },
        { id: 'walmart', name: 'Walmart' },
        { id: 'amazon', name: 'Amazon' },
        { id: 'target', name: 'Target' },
        { id: 'costco', name: 'Costco' },
        { id: 'albertsons', name: 'Albertsons' },
      ],
    }),
    stores: t({
      key: ['retailer_id', 'external_id'],
      identity: true,
      publicRead: true,
      defaults: () => ({ active: true }),
    }),
    // As seeded by the migration, plus the enabled mock retailers.
    sources: t({
      key: ['id'],
      publicRead: false,
      rows: [
        ['kroger-api', 'kroger', 'api', 'store', false],
        ['walmart-affiliate', 'walmart', 'api', 'online', false],
        ['walmart-page', 'walmart', 'page', 'store', false],
        ['amazon-creators', 'amazon', 'api', 'online', false],
        ['amazon-page', 'amazon', 'page', 'online', false],
        ['bls-ap', null, 'structured', 'region', false],
        ['mock-kroger', 'kroger', 'mock', 'store', true],
        ['mock-walmart', 'walmart', 'mock', 'store', true],
        ['mock-amazon', 'amazon', 'mock', 'online', true],
      ].map(([id, retailer_id, kind, scope, enabled]) => ({
        id,
        retailer_id,
        kind,
        scope,
        enabled,
        legal_approved_at: null,
      })),
    }),
    items: t({ key: ['id'], publicRead: true }),
    item_identifiers: t({
      key: ['retailer_id', 'retailer_sku'],
      identity: true,
      publicRead: true,
      publicFilter: (r) => r.status === 'approved',
      defaults: () => ({ status: 'pending', created_at: new Date().toISOString() }),
    }),
    price_observations: t({
      key: ['item_id', 'retailer_id', 'store_id', 'day', 'source_id'],
      identity: true,
      publicRead: true,
    }),
    price_events: t({
      key: ['item_id', 'retailer_id', 'region', 'day', 'kind'],
      identity: true,
      publicRead: true,
    }),
    price_tasks: t({
      identity: true,
      publicRead: false,
      defaults: () => ({
        state: 'queued',
        attempts: 0,
        not_before: new Date().toISOString(),
        claimed_at: null,
        finished_at: null,
        error: null,
      }),
    }),
    review_queue: t({
      identity: true,
      publicRead: false,
      defaults: () => ({ state: 'open', created_at: new Date().toISOString(), detail: {} }),
    }),
    contributed_prices: t({ publicRead: false }),
    ingest_runs: t({
      identity: true,
      publicRead: false,
      rows: runs,
      defaults: () => ({
        started_at: new Date().toISOString(),
        finished_at: null,
        status: 'running',
        rows_upserted: 0,
        detail: null,
      }),
    }),
  };
  return tables;
}

export class RestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

/** Parses a PostgREST filter value such as `eq.kroger`, `in.(a,b)` or `is.null`. */
function predicate(column: string, expr: string): (r: Row) => boolean {
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const cmp = (v: unknown) => (typeof v === 'number' ? Number(raw) : raw);
  switch (op) {
    case 'eq':
      return (r) => String(r[column]) === raw;
    case 'neq':
      return (r) => String(r[column]) !== raw;
    case 'gt':
      return (r) => (r[column] as never) > (cmp(r[column]) as never);
    case 'gte':
      return (r) => (r[column] as never) >= (cmp(r[column]) as never);
    case 'lt':
      return (r) => (r[column] as never) < (cmp(r[column]) as never);
    case 'lte':
      return (r) => (r[column] as never) <= (cmp(r[column]) as never);
    case 'in': {
      const set = new Set(
        raw
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((s) => s.replace(/^"|"$/g, '')),
      );
      return (r) => set.has(String(r[column]));
    }
    case 'is':
      if (raw === 'null') return (r) => r[column] === null || r[column] === undefined;
      if (raw === 'true' || raw === 'false') return (r) => r[column] === (raw === 'true');
      break;
  }
  throw new RestError(400, `unsupported filter ${column}=${expr}`);
}

function filtersOf(params: URLSearchParams) {
  const preds: ((r: Row) => boolean)[] = [];
  for (const [k, v] of params) if (!RESERVED.has(k)) preds.push(predicate(k, v));
  return (r: Row) => preds.every((p) => p(r));
}

const keyOf = (r: Row, cols: string[]) => JSON.stringify(cols.map((c) => r[c] ?? null));

export type RestRequest = {
  method: string;
  table: string;
  params: URLSearchParams;
  prefer: string;
  /** True when the caller holds the service role key. */
  service: boolean;
  body: unknown;
};

export type RestResult = { status: number; body?: unknown; headers?: Record<string, string> };

export function handleRest(tables: Record<string, TableDef>, req: RestRequest): RestResult {
  const def = tables[req.table];
  if (!def) throw new RestError(404, `relation "public.${req.table}" does not exist`);
  const representation = req.prefer.includes('return=representation');

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!def.publicRead && !req.service) {
      throw new RestError(401, `permission denied for table ${req.table}`);
    }
    const match = filtersOf(req.params);
    let rows = def.rows.filter(
      (r) => match(r) && (req.service || !def.publicFilter || def.publicFilter(r)),
    );
    const order = req.params.get('order');
    if (order) {
      const specs = order.split(',').map((s) => {
        const [col, dir] = s.split('.');
        return { col: col!, desc: dir === 'desc' };
      });
      rows = [...rows].sort((a, b) => {
        for (const { col, desc } of specs) {
          const x = a[col] as never;
          const y = b[col] as never;
          if (x < y) return desc ? 1 : -1;
          if (x > y) return desc ? -1 : 1;
        }
        return 0;
      });
    }
    const total = rows.length;
    const offset = Number(req.params.get('offset') ?? 0);
    const limit = req.params.has('limit') ? Number(req.params.get('limit')) : Infinity;
    rows = rows.slice(offset, offset + limit);
    return {
      status: 200,
      body: rows,
      headers: {
        'content-range': `${rows.length ? `${offset}-${offset + rows.length - 1}` : '*'}/${total}`,
      },
    };
  }

  if (!req.service) throw new RestError(401, `permission denied for table ${req.table}`);

  if (req.method === 'POST') {
    const input = (Array.isArray(req.body) ? req.body : [req.body]) as Row[];
    const conflict = req.params.get('on_conflict')?.split(',') ?? def.key;
    const merge = req.prefer.includes('resolution=merge-duplicates');
    const ignore = req.prefer.includes('resolution=ignore-duplicates');
    const index = conflict ? new Map(def.rows.map((r) => [keyOf(r, conflict), r])) : null;
    const out: Row[] = [];
    for (const raw of input) {
      const existing = index?.get(keyOf(raw, conflict!));
      if (existing) {
        if (merge) Object.assign(existing, raw);
        else if (!ignore)
          throw new RestError(409, `duplicate key value violates unique constraint`);
        out.push(existing);
        continue;
      }
      const row: Row = { ...def.defaults?.(), ...raw };
      if (def.identity && row.id === undefined) {
        row.id = def.rows.reduce((m, r) => Math.max(m, Number(r.id ?? 0)), 0) + 1;
      }
      def.rows.push(row);
      index?.set(keyOf(row, conflict!), row);
      out.push(row);
    }
    return { status: 201, body: representation ? out : undefined };
  }

  if (req.method === 'PATCH') {
    const match = filtersOf(req.params);
    const out = def.rows.filter(match);
    for (const r of out) Object.assign(r, req.body as Row);
    return { status: representation ? 200 : 204, body: representation ? out : undefined };
  }

  if (req.method === 'DELETE') {
    const match = filtersOf(req.params);
    const keep = def.rows.filter((r) => !match(r));
    def.rows.splice(0, def.rows.length, ...keep);
    return { status: 204 };
  }

  throw new RestError(405, `${req.method} not supported`);
}

/** Same contract as the SQL claim_price_tasks(): oldest queued, due tasks of one run. */
export function claimPriceTasks(tables: Record<string, TableDef>, runId: number, limit: number) {
  const now = new Date().toISOString();
  const claimed = tables
    .price_tasks!.rows.filter(
      (t) => t.run_id === runId && t.state === 'queued' && String(t.not_before) <= now,
    )
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(0, limit);
  for (const t of claimed) {
    t.state = 'running';
    t.claimed_at = now;
    t.attempts = Number(t.attempts) + 1;
  }
  return claimed;
}
