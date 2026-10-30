// The bot's database access, through supabase-js with the service role. The same code talks to a
// real Supabase project or to the mock server (mock-server/rest.ts implements the subset used).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { StoreLocation } from './adapters/types';
import type { CanonicalItem } from './catalog';

export type SourceRow = {
  id: string;
  retailer_id: string | null;
  kind: 'api' | 'licensed' | 'structured' | 'page' | 'mock';
  scope: 'store' | 'online' | 'region';
  enabled: boolean;
  legal_approved_at: string | null;
};

export type StoreRow = {
  id: number;
  retailer_id: string;
  external_id: string;
  name: string;
  zip: string;
  state: string;
  padd: StoreLocation['padd'];
  active: boolean;
};

export type IdentifierRow = {
  item_id: string;
  retailer_id: string;
  retailer_sku: string;
  gtin: string | null;
  status: 'approved' | 'pending' | 'rejected';
  matched_by: 'gtin' | 'crosswalk' | 'spec' | 'manual';
  confidence: number;
};

export type ObservationRow = {
  item_id: string;
  retailer_id: string;
  store_id: number | null;
  source_id: string;
  run_id: number;
  day: string;
  captured_at: string;
  regular_price: number;
  promo_price: number | null;
  member_price: number | null;
  size_qty: number;
  size_unit: string;
  unit_price: number;
  in_stock: boolean | null;
  retailer_sku: string;
  match_confidence: number;
  raw_ref: string | null;
};

export type ReviewRow = {
  item_id: string | null;
  retailer_id: string;
  store_id: number | null;
  source_id: string;
  run_id: number;
  day: string;
  reason: 'low_confidence' | 'price_jump' | 'out_of_band' | 'size_change';
  detail: Record<string, unknown>;
};

export type PriceEventRow = {
  item_id: string;
  retailer_id: string;
  region: string;
  day: string;
  from_price: number;
  to_price: number;
  kind: 'increase' | 'decrease' | 'size_change';
  tag: string | null;
};

export type TaskRow = {
  id: number;
  run_id: number;
  source_id: string;
  payload: Record<string, unknown>;
  attempts: number;
};

const BATCH = 500;
const PAGE = 1000;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export function createBotDb(
  url: string,
  serviceKey: string,
  opts: { killSwitchTtlMs?: number } = {},
) {
  const sb: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ttl = opts.killSwitchTtlMs ?? 5000;
  let sourcesCache: { at: number; rows: SourceRow[] } | null = null;

  /** Reads every page of a query (PostgREST returns at most 1000 rows per request by default). */
  async function all<T>(
    query: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    what: string,
  ) {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(await query(from, from + PAGE - 1), what) ?? [];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  async function inBatches<T>(
    rows: T[],
    write: (batch: T[]) => PromiseLike<{ error: { message: string } | null }>,
    what: string,
  ) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await write(rows.slice(i, i + BATCH));
      if (error) throw new Error(`${what}: ${error.message}`);
    }
  }

  return {
    client: sb,

    async startRun(job: string, detail: Record<string, unknown>) {
      const row = check(
        await sb.from('ingest_runs').insert({ job, detail }).select('id').single(),
        'start run',
      );
      return (row as { id: number }).id;
    },

    async finishRun(id: number, status: 'succeeded' | 'failed', rows: number, detail: unknown) {
      check(
        await sb
          .from('ingest_runs')
          .update({ status, rows_upserted: rows, detail, finished_at: new Date().toISOString() })
          .eq('id', id),
        'finish run',
      );
    },

    async syncItems(items: CanonicalItem[]) {
      const rows = items.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        size_qty: i.size.qty,
        size_unit: i.size.unit,
        priced_by: i.pricedBy,
        size_tolerance: i.sizeTolerance,
        brand_policy: i.brandPolicy,
        brand: i.brand,
        ref_price: i.refPrice,
        bls_series_id: i.blsSeriesId,
        in_default_basket: i.inDefaultBasket,
        active: true,
        updated_at: new Date().toISOString(),
      }));
      await inBatches(rows, (b) => sb.from('items').upsert(b, { onConflict: 'id' }), 'sync items');
    },

    async sources(): Promise<SourceRow[]> {
      if (!sourcesCache || Date.now() - sourcesCache.at > ttl) {
        const rows = check(await sb.from('sources').select('*'), 'read sources') as SourceRow[];
        sourcesCache = { at: Date.now(), rows };
      }
      return sourcesCache.rows;
    },

    /** The kill switch: re-read at most every few seconds. Page sources also need legal sign-off. */
    async isEnabled(sourceId: string) {
      const s = (await this.sources()).find((r) => r.id === sourceId);
      return !!s?.enabled && (s.kind !== 'page' || !!s.legal_approved_at);
    },

    async disableSource(sourceId: string, reason: string) {
      check(
        await sb.from('sources').update({ enabled: false, notes: reason }).eq('id', sourceId),
        'disable source',
      );
      sourcesCache = null;
    },

    async syncStores(retailerId: string, locations: StoreLocation[]): Promise<StoreRow[]> {
      const rows = locations.map((l) => ({
        retailer_id: retailerId,
        external_id: l.externalId,
        name: l.name,
        zip: l.zip,
        state: l.state,
        padd: l.padd,
      }));
      if (rows.length) {
        check(
          await sb.from('stores').upsert(rows, { onConflict: 'retailer_id,external_id' }),
          'sync stores',
        );
      }
      return check(
        await sb.from('stores').select('*').eq('retailer_id', retailerId).eq('active', true),
        'read stores',
      ) as StoreRow[];
    },

    async stores(): Promise<StoreRow[]> {
      return all((a, b) => sb.from('stores').select('*').order('id').range(a, b), 'read stores');
    },

    async identifiers(retailerId: string): Promise<IdentifierRow[]> {
      return all(
        (a, b) =>
          sb
            .from('item_identifiers')
            .select('*')
            .eq('retailer_id', retailerId)
            .order('id')
            .range(a, b),
        'read identifiers',
      );
    },

    /** Adds newly discovered matches. Existing rows (and any human decision on them) are kept. */
    async addIdentifiers(rows: IdentifierRow[]) {
      await inBatches(
        rows,
        (b) =>
          sb
            .from('item_identifiers')
            .upsert(b, { onConflict: 'retailer_id,retailer_sku', ignoreDuplicates: true }),
        'add identifiers',
      );
    },

    async enqueue(
      runId: number,
      tasks: { source_id: string; host: string; payload: Record<string, unknown> }[],
    ) {
      await inBatches(
        tasks.map((t) => ({ run_id: runId, ...t })),
        (b) => sb.from('price_tasks').insert(b),
        'enqueue tasks',
      );
    },

    async claim(runId: number, limit: number): Promise<TaskRow[]> {
      return check(
        await sb.rpc('claim_price_tasks', { p_run_id: runId, p_limit: limit }),
        'claim tasks',
      ) as TaskRow[];
    },

    async finishTask(id: number, state: 'done' | 'failed', error: string | null = null) {
      check(
        await sb
          .from('price_tasks')
          .update({ state, error, finished_at: new Date().toISOString() })
          .eq('id', id),
        'finish task',
      );
    },

    /** Observations for days in [from, to), for comparisons and reports. */
    async observations(from: string, to: string, columns = '*'): Promise<ObservationRow[]> {
      return all(
        (a, b) =>
          sb
            .from('price_observations')
            .select(columns)
            .gte('day', from)
            .lt('day', to)
            .order('id')
            .range(a, b) as never,
        'read observations',
      );
    },

    async upsertObservations(rows: ObservationRow[]) {
      await inBatches(
        rows,
        (b) =>
          sb
            .from('price_observations')
            .upsert(b, { onConflict: 'item_id,retailer_id,store_id,day,source_id' }),
        'write observations',
      );
    },

    async addReviews(rows: ReviewRow[]) {
      await inBatches(rows, (b) => sb.from('review_queue').insert(b), 'write reviews');
    },

    async upsertEvents(rows: PriceEventRow[]) {
      await inBatches(
        rows,
        (b) =>
          sb.from('price_events').upsert(b, { onConflict: 'item_id,retailer_id,region,day,kind' }),
        'write events',
      );
    },

    async reviews(from: string, to: string) {
      return all(
        (a, b) =>
          sb
            .from('review_queue')
            .select('*')
            .gte('day', from)
            .lt('day', to)
            .order('id')
            .range(a, b),
        'read reviews',
      ) as Promise<(ReviewRow & { id: number; state: string })[]>;
    },

    async events(from: string, to: string) {
      return all(
        (a, b) =>
          sb
            .from('price_events')
            .select('*')
            .gte('day', from)
            .lt('day', to)
            .order('id')
            .range(a, b),
        'read events',
      ) as Promise<PriceEventRow[]>;
    },

    async runs(job: string) {
      return all(
        (a, b) => sb.from('ingest_runs').select('*').eq('job', job).order('id').range(a, b),
        'read runs',
      ) as Promise<
        {
          id: number;
          status: string;
          started_at: string;
          finished_at: string | null;
          rows_upserted: number;
          detail: Record<string, unknown> | null;
        }[]
      >;
    },
  };
}

export type BotDb = ReturnType<typeof createBotDb>;
