import assert from 'node:assert/strict';

import { computeMetrics, type EventRow, percentile } from './metrics.ts';

const NOW = Date.parse('2026-10-30T12:00:30Z');
const ev = (minutesAgo: number, name: string, install: string, props = {}): EventRow => {
  const t = new Date(NOW - minutesAgo * 60_000).toISOString();
  return {
    install_id: install,
    session_id: `s-${install}`,
    name,
    props,
    platform: 'ios',
    occurred_at: t,
    received_at: t,
  };
};

Deno.test('percentile uses nearest rank', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
});

Deno.test('KPIs, funnel, regions and buckets from events', () => {
  const events = [
    ev(1, 'app_open', 'a'),
    ev(1, 'onboarding_complete', 'a', { region: 'gulf', state: 'TX' }),
    ev(2, 'basket_add', 'a'),
    ev(3, 'app_open', 'b'),
    ev(3, 'onboarding_complete', 'b', { region: 'west' }),
    ev(30, 'app_open', 'c'),
    ev(30, 'onboarding_complete', 'c', { region: 'gulf' }),
    ev(90, 'purchase', 'c'),
    ev(2000, 'app_open', 'old'),
  ];
  const m = computeMetrics({ events, requests: null, runs: [], now: NOW });
  assert.equal(m.kpis.activeNow, 2);
  assert.equal(m.kpis.active24h, 3);
  assert.equal(m.kpis.sessions1h, 3);
  assert.equal(m.kpis.purchases24h, 1);
  assert.equal(m.kpis.apiP95Ms, null);
  assert.equal(m.latencyPerMinute, null);
  assert.deepEqual(
    m.funnel.map((f) => f.installs),
    [3, 3, 1, 0, 1],
  );
  assert.deepEqual(
    m.regions.map((r) => [r.label, r.installs]),
    [['Gulf Coast', 2], ['West Coast', 1]],
  );
  assert.equal(m.eventsPerMinute.length, 30);
  assert.equal(m.eventsPerMinute.at(-1)!.count, 0);
  assert.equal(m.eventsPerMinute.at(-2)!.count, 2);
  assert.equal(m.recent[0]!.name, 'app_open');
});

Deno.test('API latency, error rate and routes from request logs', () => {
  const requests = Array.from({ length: 100 }, (_, i) => ({
    at: NOW - 60_000,
    route: i % 4 === 0 ? 'POST /rest/v1/app_events' : 'POST /rest/v1/rpc/fuel_series_daily',
    status: i < 5 ? 503 : 200,
    ms: i + 1,
  }));
  const m = computeMetrics({ events: [], requests, runs: [], now: NOW });
  assert.equal(m.kpis.apiP95Ms, 95);
  assert.equal(m.kpis.apiErrorRate, 0.05);
  assert.equal(m.kpis.requestsPerMin, 20);
  assert.equal(m.routes![0]!.route, 'POST /rest/v1/rpc/fuel_series_daily');
  assert.equal(m.routes![0]!.requests, 75);
  assert.equal(m.latencyPerMinute!.at(-2)!.count, 100);
});

Deno.test('ingest runs newest first with missing series', () => {
  const m = computeMetrics({
    events: [],
    requests: null,
    runs: [
      {
        id: 1,
        status: 'succeeded',
        started_at: 'a',
        finished_at: 'b',
        rows_upserted: 10,
        detail: { missing: [] },
      },
      {
        id: 2,
        status: 'failed',
        started_at: 'c',
        finished_at: 'd',
        rows_upserted: 0,
        detail: { error: 'x' },
      },
    ],
    now: NOW,
  });
  assert.deepEqual(
    m.ingest.map((r) => [r.id, r.status, r.missing]),
    [[2, 'failed', []], [1, 'succeeded', []]],
  );
});
