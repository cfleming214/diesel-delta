import {
  alignSeries,
  computeDelta,
  evaluateAlerts,
  type AlertEvent,
  type AlertSnapshot,
} from '@/domain';
import { AREA_NAMES, api, fuelArea } from '@/data';
import { basketIds, usePrefs } from '@/store/prefs';
import { useAlertState } from '@/store/alertState';

import { push, type PushProvider } from './push';

/** Window used for the Delta tolerance alert (the app's default headline window). */
const ALERT_WINDOW = 90;

/**
 * Gathers the current values, evaluates alert rules against the last snapshot, delivers any events
 * and saves the new snapshot. Returns the delivered events.
 */
export async function runAlerts(provider: PushProvider = push): Promise<AlertEvent[]> {
  const prefs = usePrefs.getState();
  if (!prefs.state || !prefs.region) return [];
  const area = fuelArea(prefs.state, 'diesel', 'state');
  const [fuel, basket, items] = await Promise.all([
    api.getFuelSeries(area, 'diesel'),
    api.getBasketSeries(basketIds(prefs.basket)),
    Promise.all(prefs.followed.map((id) => api.getItem(id, prefs.region!).catch(() => null))),
  ]);
  const aligned = alignSeries(fuel, basket);
  const deltaAbs =
    aligned && aligned.a.length > ALERT_WINDOW
      ? Math.abs(computeDelta(aligned.a, aligned.b, ALERT_WINDOW).delta)
      : 0;
  const current: AlertSnapshot = {
    dieselPrice: fuel.values[fuel.values.length - 1]!,
    deltaAbs,
    itemPrices: Object.fromEntries(items.flatMap((i) => (i ? [[i.id, i.price]] : []))),
  };
  const events = evaluateAlerts({
    settings: {
      enabled: prefs.alerts,
      dieselThreshold: prefs.dieselThreshold,
      tolerance: prefs.tolerance,
    },
    previous: useAlertState.getState().snapshot,
    current,
    seriesName: AREA_NAMES[area],
    itemNames: Object.fromEntries(items.flatMap((i) => (i ? [[i.id, i.name]] : []))),
  });
  if (events.length > 0 && (await provider.permission()) === 'granted') {
    for (const e of events) await provider.deliver(e);
  }
  useAlertState.getState().save(current);
  return events;
}
