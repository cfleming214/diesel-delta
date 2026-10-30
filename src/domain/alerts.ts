import { money } from './format';

/** What the alert rules compare between runs. */
export type AlertSnapshot = {
  /** Latest weekly diesel price for the user's series. */
  dieselPrice: number;
  /** Absolute headline Delta in points. */
  deltaAbs: number;
  /** Current shelf price of each followed item. */
  itemPrices: Record<string, number>;
};

export type AlertKind = 'dieselCross' | 'followedDrop' | 'deltaTolerance';

export type AlertEvent = {
  kind: AlertKind;
  title: string;
  body: string;
  /** In-app route the notification opens. */
  url: string;
};

export type AlertSettings = {
  enabled: Record<AlertKind, boolean>;
  dieselThreshold: number;
  tolerance: number;
};

/**
 * Edge-triggered alert rules: each fires when its condition starts being true between two runs,
 * not on every run while it stays true. The first run (no previous snapshot) only sets a baseline.
 */
export function evaluateAlerts(opts: {
  settings: AlertSettings;
  previous: AlertSnapshot | null;
  current: AlertSnapshot;
  seriesName: string;
  itemNames: Record<string, string>;
}): AlertEvent[] {
  const { settings, previous: prev, current: cur } = opts;
  if (!prev) return [];
  const events: AlertEvent[] = [];
  const t = settings.dieselThreshold;

  if (settings.enabled.dieselCross) {
    const fellBelow = prev.dieselPrice >= t && cur.dieselPrice < t;
    const roseAbove = prev.dieselPrice < t && cur.dieselPrice >= t;
    if (fellBelow || roseAbove) {
      events.push({
        kind: 'dieselCross',
        title: `Diesel ${fellBelow ? 'fell below' : 'rose above'} ${money(t)}/gal`,
        body: `${opts.seriesName} diesel is ${money(cur.dieselPrice)}/gal, from ${money(prev.dieselPrice)} last week.`,
        url: '/',
      });
    }
  }

  if (settings.enabled.followedDrop) {
    for (const [id, price] of Object.entries(cur.itemPrices)) {
      const before = prev.itemPrices[id];
      if (before != null && price < before - 0.005) {
        events.push({
          kind: 'followedDrop',
          title: `${opts.itemNames[id] ?? 'A followed item'} dropped to ${money(price)}`,
          body: `Down ${money(before - price)} from ${money(before)}.`,
          url: `/item/${id}`,
        });
      }
    }
  }

  if (settings.enabled.deltaTolerance) {
    if (prev.deltaAbs <= settings.tolerance && cur.deltaAbs > settings.tolerance) {
      events.push({
        kind: 'deltaTolerance',
        title: `Your Delta widened to ${cur.deltaAbs.toFixed(1)} pts`,
        body: `That is past your ${settings.tolerance}-point tolerance.`,
        url: '/',
      });
    }
  }
  return events;
}
