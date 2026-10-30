import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { __setTelemetrySink, flush, track, type TelemetrySink } from '@/lib/telemetry';

const settle = () => new Promise((r) => setImmediate(r));

function sink(fail = false) {
  const batches: { name: string; props: object; install_id: string; session_id: string }[][] = [];
  const s: TelemetrySink = {
    send: jest.fn(async (rows) => {
      if (fail) throw new Error('offline');
      batches.push(rows as never);
    }),
  };
  return { s, batches };
}

describe('telemetry', () => {
  beforeEach(() => AsyncStorage.clear());
  afterEach(() => __setTelemetrySink(null));

  test('is a no-op without a configured backend', async () => {
    __setTelemetrySink(null);
    track('app_open');
    await settle();
    await expect(flush()).resolves.toBeUndefined();
  });

  test('batches events with a stable install ID and session ID, and no PII fields', async () => {
    const { s, batches } = sink();
    __setTelemetrySink(s);
    track('app_open');
    track('screen_view', { screen: 'today' });
    await settle();
    await flush();
    expect(batches).toHaveLength(1);
    const [a, b] = batches[0]!;
    expect(a).toMatchObject({ name: 'app_open', props: {}, platform: 'ios' });
    expect(b).toMatchObject({ name: 'screen_view', props: { screen: 'today' } });
    expect(a!.install_id).toBe(b!.install_id);
    expect(a!.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await AsyncStorage.getItem('dd.installId')).toBe(a!.install_id);
    expect(Object.keys(a!).sort()).toEqual([
      'app_version',
      'install_id',
      'name',
      'occurred_at',
      'platform',
      'props',
      'session_id',
    ]);
  });

  test('sends automatically at 20 events', async () => {
    const { s, batches } = sink();
    __setTelemetrySink(s);
    for (let i = 0; i < 20; i++) track('scrub', { i });
    await settle();
    await settle();
    expect(batches[0]).toHaveLength(20);
  });

  test('keeps events after a failed send and retries them', async () => {
    const failing = sink(true);
    __setTelemetrySink(failing.s);
    track('search', { results: 2, link: false });
    await settle();
    await flush();
    expect(failing.s.send).toHaveBeenCalledTimes(1);
    // Same queue, now online.
    const ok = sink();
    (failing.s.send as jest.Mock).mockImplementation(async (rows: unknown) => {
      ok.batches.push(rows as never);
    });
    await flush();
    expect(ok.batches[0]!.map((r) => r.name)).toEqual(['search']);
  });

  test('replaces oversized props instead of dropping the event', async () => {
    const { s, batches } = sink();
    __setTelemetrySink(s);
    track('error', { where: 'x'.repeat(2000) });
    await settle();
    await flush();
    expect(batches[0]![0]!.props).toEqual({ truncated: true });
  });
});
