// Admin dashboard metrics for the live project: the same snapshot the mock backend serves, computed
// from app_events and ingest_runs. API latency comes from Supabase logs, so those fields are null.
import { computeMetrics, type EventRow, type RunRow } from '../_shared/metrics.ts';

export type AdminDb = {
  /** Events received since the given ISO time, newest last, capped at `limit`. */
  eventsSince(sinceIso: string, limit: number): Promise<EventRow[]>;
  recentRuns(limit: number): Promise<RunRow[]>;
};

export type AdminDeps = { db: AdminDb; adminToken: string; now?: () => number };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'x-admin-token, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};
/** Upper bound on rows read per request; the dashboard looks at the last 24 hours. */
export const MAX_EVENTS = 50_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

export function createAdminHandler(deps: AdminDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'GET') return json(405, { error: 'GET only' });
    const token = req.headers.get('x-admin-token') ?? '';
    if (!deps.adminToken || token !== deps.adminToken) return json(401, { error: 'unauthorized' });
    const now = (deps.now ?? Date.now)();
    const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    try {
      const [events, runs] = await Promise.all([
        deps.db.eventsSince(since, MAX_EVENTS),
        deps.db.recentRuns(10),
      ]);
      return json(200, computeMetrics({ events, requests: null, runs, now }));
    } catch (e) {
      return json(502, { error: e instanceof Error ? e.message : String(e) });
    }
  };
}
