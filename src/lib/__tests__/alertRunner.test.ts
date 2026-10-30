import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { AlertEvent } from '@/domain';
import { runAlerts } from '@/lib/alertRunner';
import type { PushProvider } from '@/lib/push';
import { useAlertState } from '@/store/alertState';
import { usePrefs } from '@/store/prefs';

function provider(permission: 'granted' | 'denied' = 'granted') {
  const delivered: AlertEvent[] = [];
  const p: PushProvider = {
    permission: async () => permission,
    request: async () => permission === 'granted',
    deliver: jest.fn(async (e: AlertEvent) => void delivered.push(e)),
  };
  return { p, delivered };
}

describe('runAlerts', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    useAlertState.getState().reset();
  });

  test('first run saves a baseline from current data', async () => {
    const { p, delivered } = provider();
    expect(await runAlerts(p)).toEqual([]);
    const s = useAlertState.getState().snapshot!;
    expect(s.dieselPrice).toBeCloseTo(3.4398, 3);
    expect(s.deltaAbs.toFixed(1)).toBe('4.0');
    expect(Object.keys(s.itemPrices).sort()).toEqual(['chicken', 'ketchup', 'milk']);
    expect(delivered).toEqual([]);
  });

  test('delivers alerts that started since the last run', async () => {
    useAlertState.getState().save({
      dieselPrice: 3.5, // was above $3.25 ... now $3.44: no cross
      deltaAbs: 2.0, // was within the 3-point tolerance; now 4.0
      itemPrices: { milk: 4.19, chicken: 4.29, ketchup: 4.79 }, // milk now $3.89
    });
    const { p, delivered } = provider();
    const events = await runAlerts(p);
    expect(events.map((e) => e.kind).sort()).toEqual(['deltaTolerance', 'followedDrop']);
    expect(delivered).toHaveLength(2);
    expect(delivered.find((e) => e.kind === 'followedDrop')?.url).toBe('/item/milk');
  });

  test('without notification permission nothing is shown, but the snapshot advances', async () => {
    useAlertState.getState().save({ dieselPrice: 3.5, deltaAbs: 2, itemPrices: {} });
    const { p, delivered } = provider('denied');
    expect(await runAlerts(p)).toHaveLength(1);
    expect(delivered).toEqual([]);
    expect(useAlertState.getState().snapshot?.deltaAbs).toBeGreaterThan(3);
  });
});
