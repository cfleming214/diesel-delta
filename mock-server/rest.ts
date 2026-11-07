// The subset of PostgREST that the price bot uses through supabase-js, over in-memory tables that
// mirror supabase/migrations/20261031000000_price_bot.sql, 20261104000000_bls_prices.sql and
// 20261107000000_bls_products.sql:
// select with eq/neq/gt/gte/lt/lte/in/is filters, order, limit and offset; insert; upsert on a
// conflict key (nulls equal, like the migration's `unique nulls not distinct`); and update.
// Also the read RPCs from 20261101000000_price_history.sql and 20261107000100_bls_read.sql.
import { censusRegionForState } from '../src/data/geo/census';

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
        ['bls-ap', null, 'structured', 'region', true],
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
    bls_series: t({ key: ['id'], publicRead: true }),
    bls_prices: t({ key: ['series_id', 'month'], publicRead: true }),
    bls_products: t({ key: ['item_code'], publicRead: true }),
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

/** Identity sequences per table, like a Postgres identity column (scanning once to start). */
const sequences = new WeakMap<TableDef, number>();
function nextId(def: TableDef) {
  // Rows appended by other code paths (the ingest-eia mock writes ingest_runs directly) count too.
  const last = Math.max(
    sequences.get(def) ?? def.rows.reduce((m, r) => Math.max(m, Number(r.id ?? 0)), 0),
    Number(def.rows.at(-1)?.id ?? 0),
  );
  sequences.set(def, last + 1);
  return last + 1;
}

/** Natural-key indexes per table and conflict key, kept across requests (like a unique index). */
const indexes = new WeakMap<TableDef, Map<string, Map<string, Row>>>();
function indexFor(def: TableDef, cols: string[]) {
  let byCols = indexes.get(def);
  if (!byCols) indexes.set(def, (byCols = new Map()));
  const name = cols.join(',');
  let index = byCols.get(name);
  // Rebuild if rows were added or removed outside this index (seed rows, other keys).
  if (!index || index.size !== def.rows.length) {
    index = new Map(def.rows.map((r) => [keyOf(r, cols), r]));
    byCols.set(name, index);
  }
  return index;
}

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
    const index = conflict ? indexFor(def, conflict) : null;
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
        row.id = nextId(def);
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
    // An update may change key columns; drop cached indexes for this table.
    indexes.delete(def);
    return { status: representation ? 200 : 204, body: representation ? out : undefined };
  }

  if (req.method === 'DELETE') {
    const match = filtersOf(req.params);
    const keep = def.rows.filter((r) => !match(r));
    def.rows.splice(0, def.rows.length, ...keep);
    indexes.delete(def);
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

const medianOf = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Same contract as the SQL item_prices_on(): national (median) price per item × retailer × day. */
export function itemPricesOn(tables: Record<string, TableDef>, days: string[]) {
  const want = new Set(days);
  const groups = new Map<string, number[]>();
  for (const o of tables.price_observations!.rows) {
    if (!want.has(String(o.day))) continue;
    const k = `${o.day}|${o.item_id}|${o.retailer_id}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(Number(o.regular_price));
  }
  return [...groups]
    .map(([k, prices]) => {
      const [day, item_id, retailer_id] = k.split('|');
      return { day, item_id, retailer_id, price: round4(medianOf(prices)), stores: prices.length };
    })
    .sort(
      (a, b) =>
        a.day!.localeCompare(b.day!) ||
        a.item_id!.localeCompare(b.item_id!) ||
        a.retailer_id!.localeCompare(b.retailer_id!),
    );
}

/** Same contract as the SQL basket_daily(): daily basket cost at one retailer. */
export function basketDaily(
  tables: Record<string, TableDef>,
  from: string,
  to: string,
  items: string[],
  retailer: string,
) {
  const want = new Set(items);
  const groups = new Map<string, number[]>();
  for (const o of tables.price_observations!.rows) {
    const day = String(o.day);
    if (o.retailer_id !== retailer || day < from || day > to || !want.has(String(o.item_id))) {
      continue;
    }
    const k = `${day}|${o.item_id}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(Number(o.regular_price));
  }
  const byDay = new Map<string, { cost: number; items: number }>();
  for (const [k, prices] of groups) {
    const day = k.slice(0, k.indexOf('|'));
    const d = byDay.get(day) ?? { cost: 0, items: 0 };
    d.cost += medianOf(prices);
    d.items++;
    byDay.set(day, d);
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, cost: round4(d.cost), items: d.items }));
}

// --- BLS products (same contracts as supabase/migrations/20261107000100_bls_read.sql) ---

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** First of the month `n` months before `month` (YYYY-MM-01). */
function monthsBefore(month: string, n: number) {
  const t = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}

/** Monday of the day's week, like date_trunc('week', day). */
function weekOf(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return isoDay(d);
}

/** items.bls_item_code, a generated column in Postgres. */
const blsItemCode = (item: Row) => String(item.bls_series_id ?? '').slice(7) || null;

export function blsRegionUsed(tables: Record<string, TableDef>, code: string, region: string) {
  const p = tables.bls_products!.rows.find((r) => r.item_code === code);
  return region !== 'nat' && ((p?.regions_current as string[]) ?? []).includes(region)
    ? region
    : 'nat';
}

/** Retailer prices for a product in BLS's unit; mock rows dropped for retailers with real data. */
function blsRetailerPrices(
  tables: Record<string, TableDef>,
  code: string,
  region: string,
  from: string,
) {
  const product = tables.bls_products!.rows.find((r) => r.item_code === code);
  const base = Number(product?.base_qty ?? 0);
  if (!base) return [];
  const items = new Set(
    tables.items!.rows.filter((i) => blsItemCode(i) === code).map((i) => String(i.id)),
  );
  const storeRegion = new Map(
    tables.stores!.rows.map((s) => [Number(s.id), censusRegionForState(String(s.state))]),
  );
  const kind = new Map(tables.sources!.rows.map((s) => [String(s.id), String(s.kind)]));
  const obs = tables.price_observations!.rows.flatMap((o) => {
    const regular = Number(o.regular_price);
    const storeId = o.store_id === null || o.store_id === undefined ? null : Number(o.store_id);
    if (!items.has(String(o.item_id)) || String(o.day) < from || !(regular > 0)) return [];
    if (o.unit_price === null || o.unit_price === undefined) return [];
    if (region !== 'nat' && storeId !== null && storeRegion.get(storeId) !== region) return [];
    const effective = o.promo_price ? Number(o.promo_price) : regular;
    return [
      {
        retailerId: String(o.retailer_id),
        day: String(o.day),
        price: ((Number(o.unit_price) * effective) / regular) * base,
        storeId,
        itemId: String(o.item_id),
        online: storeId === null,
        sample: kind.get(String(o.source_id)) === 'mock',
      },
    ];
  });
  const hasReal = new Set(obs.filter((o) => !o.sample).map((o) => o.retailerId));
  return obs.filter((o) => !(o.sample && hasReal.has(o.retailerId)));
}

/** Same contract as the SQL product_retailer_weekly(). */
export function productRetailerWeekly(
  tables: Record<string, TableDef>,
  code: string,
  region = 'nat',
  from = daysAgo(371),
) {
  const groups = new Map<string, ReturnType<typeof blsRetailerPrices>>();
  for (const o of blsRetailerPrices(tables, code, region, from)) {
    const k = `${o.retailerId}|${weekOf(o.day)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(o);
  }
  return [...groups]
    .map(([k, rows]) => {
      const [retailer_id, week] = k.split('|') as [string, string];
      return {
        retailer_id,
        week,
        price: round(medianOf(rows.map((r) => r.price)), 3),
        observations: rows.length,
        stores: new Set(rows.map((r) => r.storeId)).size,
        items: new Set(rows.map((r) => r.itemId)).size,
        online: rows.every((r) => r.online),
        sample: rows.some((r) => r.sample),
      };
    })
    .sort((a, b) => a.retailer_id.localeCompare(b.retailer_id) || a.week.localeCompare(b.week));
}

/** Same contract as the SQL bls_product_monthly(). */
export function blsProductMonthly(
  tables: Record<string, TableDef>,
  code: string,
  region = 'nat',
  from: string | null = null,
) {
  const used = blsRegionUsed(tables, code, region);
  const series = new Map(
    tables
      .bls_series!.rows.filter(
        (s) => s.item_code === code && (s.region === used || s.region === 'nat'),
      )
      .map((s) => [String(s.id), String(s.region)]),
  );
  return tables
    .bls_prices!.rows.filter(
      (p) => series.has(String(p.series_id)) && (!from || String(p.month) >= from),
    )
    .map((p) => ({
      region: series.get(String(p.series_id))!,
      month: String(p.month),
      price: Number(p.price),
    }))
    .sort((a, b) => a.region.localeCompare(b.region) || a.month.localeCompare(b.month));
}

/** Same contract as the SQL bls_product_list(). */
export function blsProductList(tables: Record<string, TableDef>, region = 'nat') {
  const priceOf = new Map(
    tables.bls_prices!.rows.map((p) => [`${p.series_id}|${p.month}`, Number(p.price)]),
  );
  const change = (seriesId: string, month: string, price: number, n: number) => {
    const before = priceOf.get(`${seriesId}|${monthsBefore(month, n)}`);
    return before ? round((price / before - 1) * 100, 2) : null;
  };
  return tables
    .bls_products!.rows.filter((p) => p.current)
    .flatMap((p) => {
      const code = String(p.item_code);
      const used = blsRegionUsed(tables, code, region);
      const series = tables.bls_series!.rows.find((s) => s.item_code === code && s.region === used);
      if (!series) return [];
      const latest = tables
        .bls_prices!.rows.filter((r) => r.series_id === series.id)
        .sort((a, b) => String(b.month).localeCompare(String(a.month)))[0];
      if (!latest) return [];
      const id = String(series.id);
      const month = String(latest.month);
      const price = Number(latest.price);
      const recent = blsRetailerPrices(tables, code, region, daysAgo(35));
      return [
        {
          item_code: code,
          display_name: String(p.display_name),
          category: String(p.category),
          unit_label: String(p.unit_label),
          region_used: used,
          series_id: id,
          month,
          price,
          change_1m: change(id, month, price, 1),
          change_3m: change(id, month, price, 3),
          change_12m: change(id, month, price, 12),
          retailers: new Set(recent.map((r) => r.retailerId)).size,
          sample: recent.some((r) => r.sample),
          item_ids: tables
            .items!.rows.filter(
              (i) => blsItemCode(i) === code && i.active !== false && i.category !== 'Fuel',
            )
            .map((i) => String(i.id))
            .sort(),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.display_name.localeCompare(b.display_name),
    );
}
