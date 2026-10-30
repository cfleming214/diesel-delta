import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, test } from 'node:test';

import { createMockBackend } from '../mock-server/app';
import { pickState, placeFor } from './population';
import { mulberry32, runLoad, toMarkdown, type LoadConfig } from './run';
import { DEFAULT_THRESHOLDS, evaluate, summarise } from './stats';

async function withMock<T>(
  opts: Parameters<typeof createMockBackend>[0],
  fn: (url: string, backend: ReturnType<typeof createMockBackend>) => Promise<T>,
) {
  const backend = createMockBackend(opts);
  await backend.runIngest();
  const server = createServer((req, res) => void backend.handle(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  try {
    return await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, backend);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const quick = (url: string): LoadConfig => ({
  target: { url, key: 'mock-anon-key', timeoutMs: 5000 },
  users: 30,
  rampS: 0.5,
  durationS: 2,
  thinkMin: 0.01,
  thinkMax: 0.05,
  newUserShare: 0.5,
  seed: 7,
  thresholds: DEFAULT_THRESHOLDS,
});

describe('load generator', () => {
  test('users are spread by population and mapped to the series the app requests', () => {
    const random = mulberry32(1);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) {
      const s = pickState(random);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
    assert.equal(top, 'CA');
    // California ~12% of the population.
    assert.ok(counts.CA! / 20_000 > 0.1 && counts.CA! / 20_000 < 0.14);
    assert.deepEqual(placeFor('TX'), {
      state: 'TX',
      region: 'gulf',
      onboardingArea: 'R30',
      todayArea: 'R30',
    });
    assert.equal(placeFor('CA').onboardingArea, 'SCA');
  });

  test('a short run against the mock passes thresholds and its events reach the backend', async () => {
    await withMock({}, async (url, backend) => {
      const report = await runLoad(quick(url));
      assert.equal(report.pass, true, toMarkdown(report));
      assert.equal(report.peakUsers, 30);
      assert.ok(report.journeys.completed >= 30);
      assert.deepEqual(report.ops.map((o) => o.op).sort(), [
        'insert app_events',
        'rpc fuel_series_daily',
      ]);
      const opened = new Set(
        backend.store.events.filter((e) => e.name === 'app_open').map((e) => e.install_id),
      );
      assert.equal(opened.size, 30);
      assert.ok(backend.store.events.some((e) => e.name === 'onboarding_complete'));
    });
  });

  test('a failing backend fails the run', async () => {
    await withMock({ errorRate: 1 }, async (url) => {
      const report = await runLoad({ ...quick(url), users: 5 });
      assert.equal(report.pass, false);
      assert.equal(report.journeys.completed, 0);
      assert.match(toMarkdown(report), /✕ Fail/);
    });
  });

  test('latency thresholds are per operation', () => {
    const at = 0;
    const ops = summarise([
      ...Array.from({ length: 99 }, () => ({ op: 'a', at, ms: 10, status: 200, ok: true })),
      { op: 'a', at, ms: 2000, status: 200, ok: true },
    ]);
    const checks = evaluate(ops, { started: 1, completed: 1 }, DEFAULT_THRESHOLDS);
    assert.equal(checks.find((c) => c.name === 'a p95')!.pass, true);
    assert.equal(checks.find((c) => c.name === 'a p99')!.pass, true);
    const slow = evaluate(
      summarise(
        Array.from({ length: 10 }, () => ({ op: 'a', at, ms: 900, status: 200, ok: true })),
      ),
      { started: 1, completed: 1 },
      DEFAULT_THRESHOLDS,
    );
    assert.equal(slow.find((c) => c.name === 'a p95')!.pass, false);
  });
});
