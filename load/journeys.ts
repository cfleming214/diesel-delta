// What one simulated person does in a session, replaying the app's real network calls: the fuel
// series RPC (onboarding, Today, Chart variants) and batched app_events inserts.
import { fuelArea, type FuelArea } from '@/data/geo';
import type { FuelSeriesKind } from '@/data/types';
import type { EventName, EventProps } from '@/domain/events';

import { pickState, placeFor, type Place } from './population';
import type { Sample } from './stats';

/** Matches the app (src/data/supabaseApi.ts). */
const SERIES_DAYS = 449;
/** Matches the telemetry queue (src/lib/telemetry.ts). */
const FLUSH_AT = 20;
const FLUSH_EVERY_MS = 10_000;

export type Target = { url: string; key: string; timeoutMs: number };

export type VuOptions = {
  target: Target;
  random: () => number;
  record: (s: Sample) => void;
  /** Seconds between actions within a session. */
  thinkMin: number;
  thinkMax: number;
  /** Probability that a virtual user is a first launch (onboards) rather than returning. */
  newUserShare: number;
  sleep: (ms: number) => Promise<void>;
};

export class RequestFailed extends Error {}

async function call(o: VuOptions, op: string, path: string, body: unknown, prefer?: string) {
  const started = performance.now();
  let status = 0;
  try {
    const res = await fetch(`${o.target.url}${path}`, {
      method: 'POST',
      headers: {
        apikey: o.target.key,
        authorization: `Bearer ${o.target.key}`,
        'content-type': 'application/json',
        ...(prefer ? { prefer } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(o.target.timeoutMs),
    });
    status = res.status;
    await res.arrayBuffer();
  } catch {
    status = 0;
  }
  const ok = status >= 200 && status < 300;
  o.record({ op, at: performance.now(), ms: performance.now() - started, status, ok });
  return ok;
}

/** One app install: its own install ID, sessions and event queue. */
export class VirtualUser {
  readonly installId = crypto.randomUUID();
  readonly place: Place;
  private onboarded: boolean;
  private queue: Record<string, unknown>[] = [];
  private lastFlush = performance.now();
  private sessionId = '';

  constructor(private o: VuOptions) {
    this.place = placeFor(pickState(o.random));
    this.onboarded = o.random() >= o.newUserShare;
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.o.random() * items.length)]!;
  }

  private think() {
    const s = this.o.thinkMin + this.o.random() * (this.o.thinkMax - this.o.thinkMin);
    return this.o.sleep(s * 1000);
  }

  private async fuel(area: FuelArea, kind: FuelSeriesKind) {
    const ok = await call(this.o, 'rpc fuel_series_daily', '/rest/v1/rpc/fuel_series_daily', {
      p_area: area,
      p_kind: kind,
      p_days: SERIES_DAYS,
    });
    // The app shows an error state here; the journey can't continue.
    if (!ok) throw new RequestFailed(`fuel_series_daily ${area} ${kind}`);
  }

  private async track(name: EventName, props: EventProps = {}) {
    this.queue.push({
      install_id: this.installId,
      session_id: this.sessionId,
      name,
      props,
      platform: this.o.random() < 0.6 ? 'ios' : 'android',
      app_version: '1.0.0',
      occurred_at: new Date().toISOString(),
    });
    if (this.queue.length >= FLUSH_AT || performance.now() - this.lastFlush > FLUSH_EVERY_MS) {
      await this.flush();
    }
  }

  /** Sends queued events. Like the app, a failed batch stays queued for the next attempt. */
  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    this.lastFlush = performance.now();
    const ok = await call(
      this.o,
      'insert app_events',
      '/rest/v1/app_events',
      batch,
      'return=minimal',
    );
    if (!ok) this.queue = [...batch, ...this.queue].slice(-500);
  }

  private screen(screen: string, extra: EventProps = {}) {
    return this.track('screen_view', { screen, ...extra });
  }

  /** One app session: launch, (onboard), Today, then a handful of actions with think time. */
  async session() {
    this.sessionId = crypto.randomUUID();
    const { place } = this;
    await this.track('app_open');
    if (!this.onboarded) {
      await this.screen('onboarding');
      await this.think();
      await this.fuel(place.onboardingArea, 'diesel');
      await this.think();
      await this.track('onboarding_complete', { state: place.state, region: place.region });
      this.onboarded = true;
    }
    await this.fuel(place.todayArea, 'diesel');
    await this.screen('today');

    const actions = 3 + Math.floor(this.o.random() * 8);
    for (let i = 0; i < actions; i++) {
      await this.think();
      await this.pick(ACTIONS)(this);
    }
    // Backgrounding the app flushes what is left.
    await this.flush();
  }

  // Actions, weighted by repetition in ACTIONS.
  static async scrub(u: VirtualUser) {
    await u.track('scrub', { screen: 'today', window: 90 });
  }
  static async window(u: VirtualUser) {
    await u.track('window_change', { window: u.pick([30, 60, 90, 365]), screen: 'today' });
  }
  static async chart(u: VirtualUser) {
    await u.screen('chart');
    if (u.o.random() < 0.3) await u.fuel(fuelArea(u.place.state, 'gas', 'padd'), 'gas');
    if (u.o.random() < 0.2) await u.fuel('NUS', 'diesel');
    await u.track('scrub', { screen: 'chart', window: 90 });
  }
  static async basket(u: VirtualUser) {
    await u.screen('basket');
    if (u.o.random() < 0.25) await u.track('basket_add', { item: 'yogurt', source: 'search' });
  }
  static async item(u: VirtualUser) {
    const item = u.pick(['milk', 'eggs', 'bread', 'chicken', 'ketchup']);
    await u.screen('item', { item });
    await u.track('item_view', { item, verdict: 'gouge' });
  }
  static async search(u: VirtualUser) {
    await u.screen('search');
    await u.track('search', { results: 2, link: false });
  }
  static async share(u: VirtualUser) {
    await u.screen('share');
    await u.track('share', { action: 'share', aspect: 'story', ok: true });
  }
  static async paywall(u: VirtualUser) {
    await u.screen('paywall');
    await u.track('paywall_view');
    if (u.o.random() < 0.1) await u.track('purchase', { plan: 'yearly' });
  }
}

const V = VirtualUser;
const ACTIONS: ((u: VirtualUser) => Promise<void>)[] = [
  V.scrub,
  V.scrub,
  V.scrub,
  V.window,
  V.window,
  V.chart,
  V.chart,
  V.basket,
  V.basket,
  V.item,
  V.item,
  V.search,
  V.share,
  V.paywall,
];
