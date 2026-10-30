// Admin dashboard metrics, computed from raw rows. Pure TypeScript shared by the mock backend and
// the admin-metrics Edge Function.

export type EventRow = {
  install_id: string;
  session_id: string;
  name: string;
  props: Record<string, unknown>;
  platform: string;
  occurred_at: string;
  received_at: string;
};

export type RequestRow = { at: number; route: string; status: number; ms: number };

export type RunRow = {
  id: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  rows_upserted: number;
  detail: unknown;
};

export type Snapshot = {
  generatedAt: string;
  kpis: {
    activeNow: number;
    active24h: number;
    sessions1h: number;
    eventsPerMin: number;
    purchases24h: number;
    /** API figures are null where request logs are not available (live Supabase). */
    apiP95Ms: number | null;
    apiErrorRate: number | null;
    requestsPerMin: number | null;
  };
  /** Last 30 minutes, oldest first. */
  eventsPerMinute: { t: string; count: number }[];
  latencyPerMinute: { t: string; p50: number | null; p95: number | null; count: number }[] | null;
  funnel: { step: string; label: string; installs: number }[];
  regions: { region: string; label: string; installs: number }[];
  screens: { screen: string; views: number }[];
  eventCounts: { name: string; count: number }[];
  routes: { route: string; requests: number; p50: number; p95: number; errors: number }[] | null;
  ingest: { id: number; status: string; startedAt: string; rows: number; missing: string[] }[];
  recent: { at: string; name: string; platform: string; props: Record<string, unknown> }[];
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Nearest-rank percentile of an unsorted list; null when empty. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

const round = (v: number | null, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

const FUNNEL: [string, string][] = [
  ['app_open', 'Opened the app'],
  ['onboarding_complete', 'Set a ZIP'],
  ['basket_add', 'Added to basket'],
  ['share', 'Shared a card'],
  ['purchase', 'Bought Pro'],
];

const REGION_LABELS: Record<string, string> = {
  gulf: 'Gulf Coast',
  east: 'East Coast',
  mid: 'Midwest',
  rocky: 'Rocky Mountain',
  west: 'West Coast',
};

const eventTime = (e: EventRow) => Date.parse(e.received_at);

export function computeMetrics(opts: {
  events: readonly EventRow[];
  requests: readonly RequestRow[] | null;
  runs: readonly RunRow[];
  now?: number;
}): Snapshot {
  const now = opts.now ?? Date.now();
  const since = (ms: number) => opts.events.filter((e) => eventTime(e) >= now - ms);
  const last5 = since(5 * MIN);
  const lastHour = since(HOUR);
  const lastDay = since(DAY);
  const distinct = (rows: readonly EventRow[], key: 'install_id' | 'session_id') =>
    new Set(rows.map((r) => r[key])).size;

  // Per-minute buckets for the last 30 minutes.
  const start = Math.floor(now / MIN) * MIN - 29 * MIN;
  const bucket = (t: number) => Math.floor((t - start) / MIN);
  const eventsPerMinute = Array.from({ length: 30 }, (_, i) => ({
    t: new Date(start + i * MIN).toISOString(),
    count: 0,
  }));
  for (const e of opts.events) {
    const b = bucket(eventTime(e));
    if (b >= 0 && b < 30) eventsPerMinute[b]!.count++;
  }

  let latencyPerMinute: Snapshot['latencyPerMinute'] = null;
  let routes: Snapshot['routes'] = null;
  let apiP95Ms: number | null = null;
  let apiErrorRate: number | null = null;
  let requestsPerMin: number | null = null;
  if (opts.requests) {
    const perMin: number[][] = Array.from({ length: 30 }, () => []);
    for (const r of opts.requests) {
      const b = bucket(r.at);
      if (b >= 0 && b < 30) perMin[b]!.push(r.ms);
    }
    latencyPerMinute = perMin.map((ms, i) => ({
      t: eventsPerMinute[i]!.t,
      p50: round(percentile(ms, 50), 1),
      p95: round(percentile(ms, 95), 1),
      count: ms.length,
    }));
    const recent = opts.requests.filter((r) => r.at >= now - 5 * MIN);
    apiP95Ms = round(percentile(recent.map((r) => r.ms), 95), 1);
    apiErrorRate = recent.length
      ? recent.filter((r) => r.status >= 500).length / recent.length
      : null;
    requestsPerMin = recent.length ? round(recent.length / 5, 1) : 0;
    const byRoute = new Map<string, RequestRow[]>();
    for (const r of opts.requests.filter((r) => r.at >= now - HOUR)) {
      byRoute.set(r.route, [...(byRoute.get(r.route) ?? []), r]);
    }
    routes = [...byRoute.entries()]
      .map(([route, rows]) => ({
        route,
        requests: rows.length,
        p50: round(percentile(rows.map((r) => r.ms), 50), 1)!,
        p95: round(percentile(rows.map((r) => r.ms), 95), 1)!,
        errors: rows.filter((r) => r.status >= 500).length,
      }))
      .sort((a, b) => b.requests - a.requests);
  }

  const installsWith = (name: string) =>
    new Set(lastDay.filter((e) => e.name === name).map((e) => e.install_id)).size;

  const regionCounts = new Map<string, Set<string>>();
  for (const e of opts.events) {
    if (e.name !== 'onboarding_complete') continue;
    const region = String(e.props.region ?? 'unknown');
    regionCounts.set(region, (regionCounts.get(region) ?? new Set()).add(e.install_id));
  }

  const count = <K extends string>(rows: readonly EventRow[], key: (e: EventRow) => K | null) => {
    const m = new Map<K, number>();
    for (const e of rows) {
      const k = key(e);
      if (k != null) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  return {
    generatedAt: new Date(now).toISOString(),
    kpis: {
      activeNow: distinct(last5, 'install_id'),
      active24h: distinct(lastDay, 'install_id'),
      sessions1h: distinct(lastHour, 'session_id'),
      eventsPerMin: round(last5.length / 5, 1)!,
      purchases24h: lastDay.filter((e) => e.name === 'purchase').length,
      apiP95Ms,
      apiErrorRate,
      requestsPerMin,
    },
    eventsPerMinute,
    latencyPerMinute,
    funnel: FUNNEL.map(([step, label]) => ({ step, label, installs: installsWith(step) })),
    regions: [...regionCounts.entries()]
      .map(([region, s]) => ({ region, label: REGION_LABELS[region] ?? region, installs: s.size }))
      .sort((a, b) => b.installs - a.installs),
    screens: count(
      lastHour,
      (e) => e.name === 'screen_view' ? String(e.props.screen ?? 'unknown') : null,
    ).map(([screen, views]) => ({ screen, views })),
    eventCounts: count(lastHour, (e) => e.name).map(([name, c]) => ({ name, count: c })),
    routes,
    ingest: [...opts.runs]
      .sort((a, b) => b.id - a.id)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        status: r.status,
        startedAt: r.started_at,
        rows: r.rows_upserted,
        missing: ((r.detail as { missing?: string[] } | null)?.missing ?? []).slice(0, 10),
      })),
    recent: [...opts.events]
      .sort((a, b) => eventTime(b) - eventTime(a))
      .slice(0, 25)
      .map((e) => ({ at: e.received_at, name: e.name, platform: e.platform, props: e.props })),
  };
}
