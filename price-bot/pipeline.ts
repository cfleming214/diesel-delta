// One daily run: plan → fetch → extract → match → normalize → validate → load (PRICE_BOT_PLAN.md §5).
import type { FetchTask, SourceAdapter } from './adapters/types';
import type { CanonicalItem } from './catalog';
import type {
  BotDb,
  IdentifierRow,
  ObservationRow,
  PriceEventRow,
  ReviewRow,
  StoreRow,
} from './db';
import { BlockedError, DisabledError, DisallowedError, type PoliteHttp } from './http';
import { matchCatalog } from './match';
import { normalize, type Previous, validate } from './normalize';

export const JOB = 'price-bot';

export type RunOptions = {
  db: BotDb;
  http: PoliteHttp;
  adapters: SourceAdapter[];
  items: CanonicalItem[];
  /** The day being priced, yyyy-mm-dd. */
  day: string;
  /** Concurrent fetch workers (each host is still rate-limited on its own). */
  workers?: number;
  /** Re-match each retailer's listings even if it already has identifiers. */
  discover?: boolean;
  /**
   * Latest prices carried between consecutive runs in one process (simulations), so each run
   * doesn't re-read two weeks of observations. Filled from the database when empty.
   */
  carry?: Carry;
  log?: (msg: string) => void;
};

export type Carry = Map<string, Previous & { day: string }>;

export type SourceSummary = {
  tasks: number;
  failedTasks: number;
  offers: number;
  published: number;
  held: number;
  unmatched: number;
  outOfStock: number;
  promos: number;
  blocked: string | null;
};

export type RunSummary = {
  runId: number;
  day: string;
  status: 'succeeded' | 'failed';
  sources: Record<string, SourceSummary>;
  /** Item × retailer cells with a published price today, over items × retailers run. */
  coverage: { filled: number; possible: number; pct: number };
  sizeChanges: number;
  durationMs: number;
};

const LOOKBACK_DAYS = 14;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "fl_oz" → "fl oz", "l" → "L". */
const unitLabel = (u: string) => (u === 'l' ? 'L' : u.replace('_', ' '));

const key = (item: string, retailer: string, store: number | null) =>
  `${item}|${retailer}|${store ?? 'online'}`;

export async function runDay(opts: RunOptions): Promise<RunSummary> {
  const started = Date.now();
  const log = opts.log ?? (() => {});
  const { db, http, day } = opts;
  const itemsById = new Map(opts.items.map((i) => [i.id, i]));
  const sources: Record<string, SourceSummary> = {};
  const runId = await db.startRun(JOB, { day });
  log(`run ${runId} for ${day}`);

  try {
    await db.syncItems(opts.items);

    // Only adapters whose source is enabled (and legally cleared, for page sources) run.
    const active: SourceAdapter[] = [];
    for (const a of opts.adapters) {
      if (await db.isEnabled(a.sourceId)) active.push(a);
      else log(`skip ${a.sourceId}: disabled`);
    }

    // Stores, identifiers and tasks per source.
    const storesById = new Map<number, StoreRow>();
    const identifiers = new Map<string, Map<string, IdentifierRow>>();
    const tasks: { source_id: string; host: string; payload: FetchTask }[] = [];
    for (const a of active) {
      sources[a.sourceId] = {
        tasks: 0,
        failedTasks: 0,
        offers: 0,
        published: 0,
        held: 0,
        unmatched: 0,
        outOfStock: 0,
        promos: 0,
        blocked: null,
      };
      const ctx = { http, rawKey: `${runId}/${a.sourceId}-setup` };
      let stores: (StoreRow | null)[] = [null];
      if (a.scope === 'store') {
        stores = await db.syncStores(a.retailerId, await a.locations(ctx));
        for (const s of stores) storesById.set(s!.id, s!);
      }

      let ids = await db.identifiers(a.retailerId);
      if (opts.discover || ids.length === 0) {
        const matched = matchCatalog(
          opts.items,
          await a.discover({ http, rawKey: `${runId}/${a.sourceId}-discover` }),
        );
        await db.addIdentifiers(
          matched.map((m) => ({
            item_id: m.match.itemId,
            retailer_id: a.retailerId,
            retailer_sku: m.product.sku,
            gtin: m.product.gtin && /^\d{8,14}$/.test(m.product.gtin) ? m.product.gtin : null,
            status: m.status,
            matched_by: 'spec',
            confidence: m.match.confidence,
          })),
        );
        ids = await db.identifiers(a.retailerId);
        log(
          `${a.sourceId}: ${matched.filter((m) => m.status === 'approved').length} approved matches, ${matched.filter((m) => m.status === 'pending').length} for review`,
        );
      }
      const approved = ids.filter((i) => i.status === 'approved' && itemsById.has(i.item_id));
      identifiers.set(a.retailerId, new Map(approved.map((i) => [i.retailer_sku, i])));

      for (const store of stores) {
        for (let i = 0; i < approved.length; i += a.batchSize) {
          tasks.push({
            source_id: a.sourceId,
            host: a.host,
            payload: {
              sourceId: a.sourceId,
              retailerId: a.retailerId,
              storeId: store?.id ?? null,
              externalStoreId: store?.external_id ?? null,
              skus: approved.slice(i, i + a.batchSize).map((x) => x.retailer_sku),
              day,
            },
          });
        }
      }
      sources[a.sourceId]!.tasks = tasks.filter((t) => t.source_id === a.sourceId).length;
    }
    await db.enqueue(runId, tasks as never);
    log(`queued ${tasks.length} fetches`);

    // The latest earlier observation per item × retailer × store, for jump and size checks.
    const previous: Carry = opts.carry ?? new Map();
    const fromDb =
      previous.size === 0 ? await db.observations(addDays(day, -LOOKBACK_DAYS), day) : [];
    for (const o of fromDb) {
      const k = key(o.item_id, o.retailer_id, o.store_id);
      const p = previous.get(k);
      if (!p || o.day > p.day) {
        previous.set(k, {
          day: o.day,
          regularPrice: Number(o.regular_price),
          size: { qty: Number(o.size_qty), unit: o.size_unit as never },
        });
      }
    }

    const adapters = new Map(active.map((a) => [a.sourceId, a]));
    const filled = new Set<string>();
    const latest: [string, Previous & { day: string }][] = [];
    let sizeChanges = 0;

    async function process(task: { id: number; payload: Record<string, unknown> }) {
      const t = task.payload as unknown as FetchTask;
      const a = adapters.get(t.sourceId)!;
      const s = sources[t.sourceId]!;
      const { offers, rawRef } = await a.fetchOffers(t, { http, rawKey: `${runId}/${task.id}` });
      s.offers += offers.length;
      const capturedAt = new Date().toISOString();
      const store = t.storeId === null ? null : storesById.get(t.storeId)!;
      const observations: ObservationRow[] = [];
      const reviews: ReviewRow[] = [];
      const events: PriceEventRow[] = [];

      for (const offer of offers) {
        const id = identifiers.get(t.retailerId)?.get(offer.sku);
        const item = id ? itemsById.get(id.item_id) : undefined;
        if (!id || !item) {
          s.unmatched++;
          continue;
        }
        const n = normalize(item, offer);
        const base = {
          item_id: item.id,
          retailer_id: t.retailerId,
          store_id: t.storeId,
          source_id: t.sourceId,
          run_id: runId,
          day,
        };
        if (!n) {
          s.held++;
          reviews.push({
            ...base,
            reason: 'out_of_band',
            detail: { why: 'unreadable price or size', offer },
          });
          continue;
        }
        const prev = previous.get(key(item.id, t.retailerId, t.storeId)) ?? null;
        const v = validate(item, n, prev);
        if (v.kind === 'hold') {
          s.held++;
          reviews.push({
            ...base,
            reason: v.reason,
            detail: { ...v.detail, sku: offer.sku, title: offer.title },
          });
          continue;
        }
        if (n.inStock === false) s.outOfStock++;
        if (n.promoPrice !== null) s.promos++;
        observations.push({
          ...base,
          captured_at: capturedAt,
          regular_price: n.regularPrice,
          promo_price: n.promoPrice,
          member_price: n.memberPrice,
          size_qty: n.size.qty,
          size_unit: n.size.unit,
          unit_price: Math.round(n.unitPrice * 1e6) / 1e6,
          in_stock: n.inStock,
          retailer_sku: offer.sku,
          match_confidence: id.confidence,
          raw_ref: rawRef,
        });
        filled.add(`${item.id}|${t.retailerId}`);
        latest.push([
          key(item.id, t.retailerId, t.storeId),
          { day, regularPrice: n.regularPrice, size: n.size },
        ]);
        if (v.sizeChange) {
          sizeChanges++;
          events.push({
            item_id: item.id,
            retailer_id: t.retailerId,
            region: store?.padd ?? 'nat',
            day,
            from_price: prev!.regularPrice,
            to_price: n.regularPrice,
            kind: 'size_change',
            tag: `${v.sizeChange.from.qty} ${unitLabel(v.sizeChange.from.unit)} → ${v.sizeChange.to.qty} ${unitLabel(v.sizeChange.to.unit)}`,
          });
        }
      }
      await db.upsertObservations(observations);
      if (reviews.length) await db.addReviews(reviews);
      if (events.length) await db.upsertEvents(events);
      s.published += observations.length;
    }

    async function worker() {
      for (;;) {
        const [task] = await db.claim(runId, 1);
        if (!task) return;
        const sourceId = String(task.payload.sourceId);
        try {
          await process(task);
          await db.finishTask(task.id, 'done');
        } catch (e) {
          sources[sourceId]!.failedTasks++;
          const msg = e instanceof Error ? e.message : String(e);
          if (e instanceof BlockedError) {
            // Stop the source instead of working around the block (§2).
            sources[sourceId]!.blocked = msg;
            await db.disableSource(sourceId, `Auto-disabled on ${day}: ${msg}`);
            log(`${sourceId}: ${msg}; source disabled`);
          } else if (!(e instanceof DisabledError) && !(e instanceof DisallowedError)) {
            log(`task ${task.id} failed: ${msg}`);
          }
          await db.finishTask(task.id, 'failed', msg);
        }
      }
    }
    await Promise.all(Array.from({ length: opts.workers ?? 4 }, worker));
    // Today's prices become the comparison point for the next run (after all checks used the old).
    for (const [k, v] of latest) previous.set(k, v);

    const retailers = new Set(active.map((a) => a.retailerId));
    const possible = opts.items.length * retailers.size;
    const summary: RunSummary = {
      runId,
      day,
      status: 'succeeded',
      sources,
      coverage: {
        filled: filled.size,
        possible,
        pct: possible ? Math.round((filled.size / possible) * 1000) / 10 : 0,
      },
      sizeChanges,
      durationMs: Date.now() - started,
    };
    const published = Object.values(sources).reduce((n, s) => n + s.published, 0);
    await db.finishRun(runId, 'succeeded', published, summary);
    return summary;
  } catch (e) {
    await db.finishRun(runId, 'failed', 0, {
      day,
      error: e instanceof Error ? e.message : String(e),
      sources,
    });
    throw e;
  }
}
