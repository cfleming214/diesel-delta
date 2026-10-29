// Request handling for ingest-eia, with storage and HTTP injected so it can be unit-tested.
import {
  type FetchJson,
  fetchWeeklyPrices,
  type SeriesRef,
  startDate,
  type WeeklyPrice,
} from '../_shared/eia.ts';

export type IngestDb = {
  listSeries(): Promise<SeriesRef[]>;
  /** Latest stored week across all series, or null when empty. */
  latestPeriod(): Promise<string | null>;
  upsertPrices(rows: WeeklyPrice[]): Promise<void>;
  startRun(): Promise<number>;
  finishRun(
    id: number,
    status: 'succeeded' | 'failed',
    rows: number,
    detail: unknown,
  ): Promise<void>;
};

export type IngestDeps = {
  db: IngestDb;
  fetchJson: FetchJson;
  eiaApiKey: string;
  /** Shared secret the scheduler sends in `x-ingest-secret`. */
  ingestSecret: string;
  now?: () => Date;
};

const UPSERT_BATCH = 1000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Constant-time comparison for the shared secret. */
function sameSecret(a: string, b: string) {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function createHandler(deps: IngestDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    if (!sameSecret(req.headers.get('x-ingest-secret') ?? '', deps.ingestSecret)) {
      return json(401, { error: 'unauthorized' });
    }

    const runId = await deps.db.startRun();
    try {
      const series = await deps.db.listSeries();
      const start = startDate(await deps.db.latestPeriod(), (deps.now ?? (() => new Date()))());
      const { rows, skipped, missing } = await fetchWeeklyPrices({
        apiKey: deps.eiaApiKey,
        series,
        start,
        fetchJson: deps.fetchJson,
      });
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        await deps.db.upsertPrices(rows.slice(i, i + UPSERT_BATCH));
      }
      const detail = {
        start,
        skipped: skipped.length,
        // A series with no rows usually means a wrong EIA series ID; surface it in the run log.
        missing: missing.map((s) => s.eia_series_id),
      };
      await deps.db.finishRun(runId, 'succeeded', rows.length, detail);
      return json(200, { rows: rows.length, ...detail });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await deps.db.finishRun(runId, 'failed', 0, { error: message });
      return json(502, { error: message });
    }
  };
}
