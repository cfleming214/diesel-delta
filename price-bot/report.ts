// Printable price report: 30-day and 1-year price changes from what the bot collected, as an HTML
// page and a PDF (through Chromium). buildReport() is pure so it can be tested; renderReport()
// draws it. History comes from item_prices_on() and basket_daily(), so a year of raw rows is never
// downloaded; only the last 30 days of observations are read for store-level detail.
import type { CanonicalItem } from './catalog';
import { sizeLabel } from './catalog';
import type { BotDb, ObservationRow, PriceEventRow, SourceRow, StoreRow } from './db';
import { JOB } from './pipeline';

export const WINDOW_DAYS = 30;
export const YEAR_DAYS = 365;

export type PricePoint = { item_id: string; retailer_id: string; price: number };
/** National prices on the day nearest a target date (null when there is no data near it). */
export type PricesOn = { target: string; day: string | null; prices: PricePoint[] };
export type BasketDay = { day: string; cost: number; items: number };

export type ReportData = {
  /** Last day of the report. The detail window is the 30 days ending here. */
  to: string;
  items: CanonicalItem[];
  /** Store-level observations for the 30-day window. */
  observations: ObservationRow[];
  stores: StoreRow[];
  /** Price events (size changes) over the past year. */
  events: PriceEventRow[];
  /** Held prices in the 30-day window. */
  reviews: { reason: string; day: string; retailer_id: string }[];
  runs: { id: number; status: string; detail: Record<string, unknown> | null }[];
  sources: SourceRow[];
  /** U.S. diesel, daily, if available. */
  diesel: { day: string; price: number }[];
  prices: { end: PricesOn; d30: PricesOn; y1: PricesOn };
  /** Daily basket cost over the past year, per retailer, for `basket.items`. */
  basket: { items: string[]; byRetailer: Record<string, BasketDay[]> };
  generatedAt: string;
};

export const RETAILERS = [
  { id: 'kroger', name: 'Kroger', color: '#2a78d6', dash: '' },
  { id: 'walmart', name: 'Walmart', color: '#eb6834', dash: '7 4' },
  { id: 'amazon', name: 'Amazon', color: '#1baf7a', dash: '2 3' },
] as const;

const PADD_NAMES: Record<string, string> = {
  east: 'East Coast',
  mid: 'Midwest',
  gulf: 'Gulf Coast',
  rocky: 'Rocky Mountain',
  west: 'West Coast',
};

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
  return out;
}

/** Hysteresis from FEATURES.md: ignore moves under $0.03 or 0.5%. */
const isChange = (a: number, b: number) => Math.abs(b - a) >= 0.03 && Math.abs(b / a - 1) >= 0.005;
const change = (from: number | null, to: number | null) =>
  from === null || to === null || !from ? null : (to / from - 1) * 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function buildReport(d: ReportData) {
  const to = d.to;
  const from30 = addDays(to, -(WINDOW_DAYS - 1));
  const days30 = daysBetween(from30, to);
  const yearStart = addDays(to, -YEAR_DAYS);
  const yearDays = daysBetween(yearStart, to);
  const itemById = new Map(d.items.map((i) => [i.id, i]));
  const storeById = new Map(d.stores.map((s) => [s.id, s]));
  const retailerIds = RETAILERS.map((r) => r.id as string).filter((r) =>
    d.prices.end.prices.some((p) => p.retailer_id === r),
  );

  const priceMap = (on: PricesOn) =>
    new Map(on.prices.map((p) => [`${p.item_id}|${p.retailer_id}`, Number(p.price)]));
  const now = priceMap(d.prices.end);
  const ago30 = priceMap(d.prices.d30);
  const ago1y = priceMap(d.prices.y1);

  // Item changes per retailer, against the national price 30 days and 1 year earlier.
  const changes = d.items.flatMap((item) =>
    retailerIds.flatMap((r) => {
      const k = `${item.id}|${r}`;
      const p = now.get(k);
      if (p === undefined) return [];
      const p30 = ago30.get(k) ?? null;
      const p1y = ago1y.get(k) ?? null;
      return [
        { item, retailer: r, now: p, p30, p1y, pct30: change(p30, p), pct1y: change(p1y, p) },
      ];
    }),
  );
  const movers = (horizon: '30' | '1y') => {
    const from = (c: (typeof changes)[number]) => (horizon === '30' ? c.p30 : c.p1y);
    const pctOf = (c: (typeof changes)[number]) => (horizon === '30' ? c.pct30 : c.pct1y)!;
    const moved = changes.filter((c) => from(c) !== null && isChange(from(c)!, c.now));
    const rows = moved.map((c) => ({
      item: c.item,
      retailer: c.retailer,
      from: from(c)!,
      to: c.now,
      pct: pctOf(c),
    }));
    return {
      up: rows
        .filter((c) => c.pct > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 10),
      down: rows
        .filter((c) => c.pct < 0)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 10),
    };
  };

  const categories = [...new Set(d.items.map((i) => i.category))]
    .map((category) => {
      const cs = changes.filter((c) => c.item.category === category);
      const c30 = cs.map((c) => c.pct30).filter((p): p is number => p !== null);
      const c1y = cs.map((c) => c.pct1y).filter((p): p is number => p !== null);
      return { category, pct30: mean(c30), pct1y: mean(c1y), n30: c30.length, n1y: c1y.length };
    })
    .sort((a, b) => (b.pct1y ?? b.pct30 ?? 0) - (a.pct1y ?? a.pct30 ?? 0));

  // Basket: complete days only (every basket item priced), over the year and the last 30 days.
  const basketN = d.basket.items.length;
  const basketSeries = retailerIds.map((r) => {
    const byDay = new Map(
      (d.basket.byRetailer[r] ?? [])
        .filter((b) => b.items === basketN && basketN > 0)
        .map((b) => [b.day, Number(b.cost)]),
    );
    const year = yearDays.map((day) => byDay.get(day) ?? null);
    const window = year.slice(-WINDOW_DAYS);
    const indexed = (xs: (number | null)[]) => {
      const base = xs.find((v) => v !== null) ?? null;
      return xs.map((v) => (v === null || base === null ? null : (v / base) * 100));
    };
    /** Cost on the first complete day on or after `day`. */
    const from = (day: string) => {
      const i = yearDays.findIndex((x) => x >= day && byDay.has(x));
      return i < 0 ? null : { day: yearDays[i]!, cost: byDay.get(yearDays[i]!)! };
    };
    const last = [...year].reverse().find((v) => v !== null) ?? null;
    const at30 = from(addDays(to, -WINDOW_DAYS));
    const at1y = from(yearStart);
    // A 1-year change needs a cost from within a week of a year ago.
    const y1 = at1y && at1y.day <= addDays(yearStart, 7) ? at1y : null;
    return {
      retailer: r,
      year: { cost: year, index: indexed(year) },
      window: { cost: window, index: indexed(window) },
      now: last,
      cost30: at30?.cost ?? null,
      cost1y: y1?.cost ?? null,
      pct30: change(at30?.cost ?? null, last),
      pct1y: change(y1?.cost ?? null, last),
    };
  });

  // Store-level shelf-price changes in the 30-day window, with the hysteresis filter.
  let increases = 0;
  let decreases = 0;
  const seq = new Map<string, ObservationRow[]>();
  for (const o of d.observations) {
    const k = `${o.item_id}|${o.retailer_id}|${o.store_id ?? 'online'}`;
    (seq.get(k) ?? seq.set(k, []).get(k)!).push(o);
  }
  for (const rows of seq.values()) {
    rows.sort((a, b) => a.day.localeCompare(b.day));
    for (let i = 1; i < rows.length; i++) {
      const a = Number(rows[i - 1]!.regular_price);
      const b = Number(rows[i]!.regular_price);
      if (!isChange(a, b)) continue;
      if (b > a) increases++;
      else decreases++;
    }
  }

  const lastObs = d.observations.filter((o) => o.day === to);
  const scorecard = retailerIds.map((r) => {
    const rows = lastObs.filter((o) => o.retailer_id === r);
    const all = d.observations.filter((o) => o.retailer_id === r);
    const b = basketSeries.find((s) => s.retailer === r)!;
    const items = changes.filter((c) => c.retailer === r);
    return {
      retailer: r,
      itemsCarried: items.length,
      stores: new Set(rows.map((o) => o.store_id).filter((s) => s !== null)).size,
      basketCost: b.now,
      basket30: b.pct30,
      basket1y: b.pct1y,
      avgItem30: mean(items.map((c) => c.pct30).filter((p): p is number => p !== null)),
      avgItem1y: mean(items.map((c) => c.pct1y).filter((p): p is number => p !== null)),
      promoShare: rows.length ? rows.filter((o) => o.promo_price !== null).length / rows.length : 0,
      outOfStock: all.length ? all.filter((o) => o.in_stock === false).length / all.length : 0,
    };
  });

  // Basket cost by region on the last day (store-priced retailers only).
  const regions = Object.keys(PADD_NAMES).map((padd) => ({
    padd,
    name: PADD_NAMES[padd]!,
    values: retailerIds
      .filter((r) => lastObs.some((o) => o.retailer_id === r && o.store_id !== null))
      .map((r) => {
        const perItem = d.basket.items.map((id) =>
          median(
            lastObs
              .filter(
                (o) =>
                  o.retailer_id === r &&
                  o.item_id === id &&
                  o.store_id !== null &&
                  storeById.get(o.store_id)?.padd === padd,
              )
              .map((o) => Number(o.regular_price)),
          ),
        );
        const ok = perItem.length > 0 && perItem.every((p) => !Number.isNaN(p));
        return { retailer: r, cost: ok ? perItem.reduce((s, p) => s + p, 0) : null };
      }),
  }));

  const shrinks = [
    ...d.events
      .filter((e) => e.kind === 'size_change')
      .reduce<Map<string, PriceEventRow & { regions: string[] }>>((m, e) => {
        const k = `${e.item_id}|${e.retailer_id}|${e.tag}`;
        const prev = m.get(k);
        if (prev) {
          prev.regions.push(e.region);
          if (e.day < prev.day) prev.day = e.day;
        } else m.set(k, { ...e, regions: [e.region] });
        return m;
      }, new Map())
      .values(),
  ].sort((a, b) => a.day.localeCompare(b.day));

  // Runs: the latest run per day counts.
  const runByDay = new Map<string, (typeof d.runs)[number]>();
  for (const r of [...d.runs].sort((a, b) => a.id - b.id)) {
    if (typeof r.detail?.day === 'string') runByDay.set(r.detail.day, r);
  }
  type RunDetail = {
    coverage?: { pct: number };
    sources?: Record<
      string,
      { tasks: number; failedTasks: number; published: number; held: number }
    >;
  };
  const runRow = (day: string) => {
    const r = runByDay.get(day);
    const det = (r?.detail ?? {}) as RunDetail;
    const srcs = Object.values(det.sources ?? {});
    return {
      day,
      status: r?.status ?? 'missing',
      coverage: det.coverage?.pct ?? null,
      published: srcs.reduce((s, x) => s + x.published, 0),
      held: srcs.reduce((s, x) => s + x.held, 0),
      failedTasks: srcs.reduce((s, x) => s + x.failedTasks, 0),
      tasks: srcs.reduce((s, x) => s + x.tasks, 0),
    };
  };
  const runRows = days30.map(runRow);
  const yearRows = yearDays.map(runRow);
  const firstDay = [...runByDay.keys()].sort()[0] ?? null;
  const year = {
    daysRun: yearRows.filter((r) => r.status === 'succeeded').length,
    days: yearDays.length,
    published: yearRows.reduce((s, r) => s + r.published, 0),
    avgCoverage: mean(yearRows.filter((r) => r.coverage !== null).map((r) => r.coverage!)),
  };

  const reviewReasons = [
    ...d.reviews.reduce(
      (m, r) => m.set(r.reason, (m.get(r.reason) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ];

  /** Diesel on a day, or the nearest earlier day in the series. */
  const dieselAt = (day: string) => {
    let best: number | null = null;
    for (const x of d.diesel) if (x.day <= day) best = x.price;
    return best;
  };
  const dieselNow = d.diesel.length ? dieselAt(to) : null;
  const diesel30 = d.diesel.some((x) => x.day <= addDays(to, -WINDOW_DAYS))
    ? dieselAt(addDays(to, -WINDOW_DAYS))
    : null;
  const diesel1y = d.diesel.some((x) => x.day <= yearStart) ? dieselAt(yearStart) : null;
  const diesel =
    dieselNow === null
      ? null
      : {
          now: dieselNow,
          ago30: diesel30,
          ago1y: diesel1y,
          pct30: change(diesel30, dieselNow),
          pct1y: change(diesel1y, dieselNow),
        };

  const usedSources = new Set(d.observations.map((o) => o.source_id));
  const simulated = [...usedSources].some(
    (s) => d.sources.find((x) => x.id === s)?.kind === 'mock',
  );

  const priceTable = d.items.map((item) => {
    const cells = retailerIds.map((r) => ({
      retailer: r,
      price: now.get(`${item.id}|${r}`) ?? null,
    }));
    const present = cells.filter((c) => c.price !== null).map((c) => c.price!);
    const low = present.length > 1 ? Math.min(...present) : null;
    // Every retailer at the lowest price is marked, so ties show as ties.
    const cheapest = cells.filter((c) => low !== null && c.price === low).map((c) => c.retailer);
    const own = changes.filter((c) => c.item.id === item.id);
    return {
      item,
      cells,
      cheapest,
      pct30: mean(own.map((c) => c.pct30).filter((p): p is number => p !== null)),
      pct1y: mean(own.map((c) => c.pct1y).filter((p): p is number => p !== null)),
    };
  });

  return {
    to,
    from30,
    yearStart,
    days30,
    yearDays,
    anchors: { end: d.prices.end.day, d30: d.prices.d30.day, y1: d.prices.y1.day },
    generatedAt: d.generatedAt,
    simulated,
    sources: [...usedSources].sort(),
    retailerIds,
    firstDay,
    totals: {
      items: d.items.length,
      observations: d.observations.length,
      stores: new Set(d.observations.map((o) => o.store_id).filter((s) => s !== null)).size,
      increases,
      decreases,
      shrinks: shrinks.length,
      held: d.reviews.length,
      avgCoverage: mean(runRows.filter((r) => r.coverage !== null).map((r) => r.coverage!)) ?? 0,
      daysMissing: runRows.filter((r) => r.status !== 'succeeded').length,
    },
    year,
    basketItems: d.basket.items.map((id) => itemById.get(id)!).filter(Boolean),
    basketSeries,
    diesel,
    categories,
    movers30: movers('30'),
    movers1y: movers('1y'),
    scorecard,
    regions,
    shrinks,
    runRows,
    reviewReasons,
    priceTable,
  };
}

export type ReportModel = ReturnType<typeof buildReport>;

// ---------- rendering ----------

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const money = (n: number | null) => (n === null || Number.isNaN(n) ? '—' : `$${n.toFixed(2)}`);
const pct = (n: number | null, digits = 1) =>
  n === null || Number.isNaN(n)
    ? '—'
    : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`;
const share = (n: number) => `${(n * 100).toFixed(1)}%`;
const retailer = (id: string) => RETAILERS.find((r) => r.id === id)!;
const dateLabel = (
  iso: string,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
const longDate = (iso: string) =>
  dateLabel(iso, { month: 'long', day: 'numeric', year: 'numeric' });

function niceTicks(lo: number, hi: number, count = 5) {
  const span = hi - lo || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0)!;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 0.5; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Legend row: a short line in each series' color and dash, with the name in ink. */
function legend(ids: string[]) {
  return `<div class="legend">${ids
    .map((id) => {
      const r = retailer(id);
      return `<span><svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke="${r.color}" stroke-width="2" stroke-dasharray="${r.dash}" stroke-linecap="round"/></svg>${esc(r.name)}</span>`;
    })
    .join('')}</div>`;
}

/** Indexed line chart, one line per retailer, with direct labels at the line ends. */
function lineChart(opts: {
  days: string[];
  series: { retailer: string; index: (number | null)[]; cost: (number | null)[] }[];
  ticks: 'month' | 'days';
  label: string;
}) {
  const { days, series } = opts;
  const W = 680;
  const H = 240;
  const pad = { l: 40, r: 128, t: 10, b: 26 };
  const vals = series.flatMap((s) => s.index.filter((v): v is number => v !== null));
  if (!vals.length) return '<p class="muted">No complete basket data in this period.</p>';
  const ticks = niceTicks(Math.min(...vals, 100), Math.max(...vals, 100), 4);
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const decimals = ticks.some((t) => t % 1) ? 1 : 0;
  const x = (i: number) => pad.l + (i / Math.max(1, days.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const grid = ticks
    .map(
      (t) =>
        `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" class="${t === 100 ? 'base' : 'grid'}"/><text x="${pad.l - 6}" y="${y(t) + 3.5}" class="tick" text-anchor="end">${t.toFixed(decimals)}</text>`,
    )
    .join('');
  const xt = days
    .map((day, i) => {
      const show =
        opts.ticks === 'month' ? day.endsWith('-01') : i % 5 === 0 || i === days.length - 1;
      if (!show) return '';
      const text =
        opts.ticks === 'month'
          ? dateLabel(
              day,
              day.slice(5, 7) === '01' ? { month: 'short', year: 'numeric' } : { month: 'short' },
            )
          : dateLabel(day);
      return `<text x="${x(i)}" y="${H - 8}" class="tick" text-anchor="middle">${esc(text)}</text>`;
    })
    .join('');
  // Hover targets: every day for a month, weekly for a year.
  const every = days.length > 60 ? 7 : 1;
  const lines = series
    .map((s) => {
      const r = retailer(s.retailer);
      // Gaps (incomplete days) break the line instead of bridging it.
      const runs: string[][] = [[]];
      s.index.forEach((v, i) => {
        if (v === null) runs.push([]);
        else runs[runs.length - 1]!.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      });
      const paths = runs
        .filter((p) => p.length > 1)
        .map(
          (p) =>
            `<polyline points="${p.join(' ')}" fill="none" stroke="${r.color}" stroke-width="2" stroke-dasharray="${r.dash}" stroke-linejoin="round" stroke-linecap="round"/>`,
        )
        .join('');
      const dots = s.index
        .map((v, i) =>
          v === null || i % every
            ? ''
            : `<circle cx="${x(i)}" cy="${y(v)}" r="5" fill="transparent"><title>${esc(r.name)} · ${dateLabel(days[i]!, { month: 'short', day: 'numeric', year: 'numeric' })}: ${v.toFixed(1)} (${money(s.cost[i]!)})</title></circle>`,
        )
        .join('');
      return paths + dots;
    })
    .join('');
  // Direct labels at the line ends, nudged apart so they never overlap.
  const ends = series
    .map((s) => {
      const i = s.index.map((v, k) => (v === null ? -1 : k)).reduce((a, b) => Math.max(a, b), -1);
      return i < 0 ? null : { s, v: s.index[i]!, i, ly: y(s.index[i]!) };
    })
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => a.ly - b.ly);
  for (let k = 1; k < ends.length; k++) ends[k]!.ly = Math.max(ends[k]!.ly, ends[k - 1]!.ly + 14);
  const labels = ends
    .map((e) => {
      const r = retailer(e.s.retailer);
      return `<line x1="${x(e.i) + 4}" x2="${x(e.i) + 14}" y1="${e.ly}" y2="${e.ly}" stroke="${r.color}" stroke-width="2" stroke-dasharray="${r.dash}"/><text x="${x(e.i) + 18}" y="${e.ly + 3.5}" class="dlabel">${esc(r.name)} ${e.v.toFixed(1)}</text>`;
    })
    .join('');
  return `${legend(series.map((s) => s.retailer))}<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label)}">${grid}${xt}${lines}${labels}</svg>`;
}

/** Horizontal bar with 4px rounded corners at the data end only. */
function hbar(x0: number, x1: number, y: number, h: number, fill: string, title: string) {
  const w = Math.abs(x1 - x0);
  const r = Math.min(4, w / 2, h / 2);
  const dir = x1 >= x0 ? 1 : -1;
  const xe = x1;
  const d =
    w < 0.5
      ? ''
      : `M${x0},${y} L${xe - dir * r},${y} Q${xe},${y} ${xe},${y + r} L${xe},${y + h - r} Q${xe},${y + h} ${xe - dir * r},${y + h} L${x0},${y + h} Z`;
  return `<path d="${d}" fill="${fill}"><title>${esc(title)}</title></path>`;
}

/** Diverging bars for one horizon: red where prices rose, blue where they fell. */
function categoryChart(rows: { category: string; pct: number | null; n: number }[], label: string) {
  const data = rows.filter(
    (r): r is { category: string; pct: number; n: number } => r.pct !== null,
  );
  if (!data.length)
    return `<p class="muted">Not enough history for ${esc(label.toLowerCase())}.</p>`;
  const W = 330;
  const row = 20;
  const H = data.length * row + 8;
  const labelW = 84;
  const valueW = 52;
  const lo = Math.min(0, ...data.map((c) => c.pct));
  const hi = Math.max(0, ...data.map((c) => c.pct));
  const span = hi - lo || 1;
  const x0 = labelW + (lo < 0 ? valueW : 4);
  const plot = W - x0 - (hi > 0 ? valueW : 4);
  const x = (v: number) => x0 + ((v - lo) / span) * plot;
  const zero = x(0);
  const bars = data
    .map((c, i) => {
      const y = 4 + i * row;
      const fill = c.pct >= 0 ? '#e34948' : '#2a78d6';
      const tx = c.pct >= 0 ? x(c.pct) + 5 : x(c.pct) - 5;
      return `<text x="${labelW - 6}" y="${y + 10}" class="cat" text-anchor="end">${esc(c.category)}</text>${hbar(zero, x(c.pct), y, 13, fill, `${c.category}, ${label}: ${pct(c.pct, 2)} (${c.n} item-retailer pairs)`)}<text x="${tx}" y="${y + 10}" class="dlabel" text-anchor="${c.pct >= 0 ? 'start' : 'end'}">${pct(c.pct, 1)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Average price change by category, ${esc(label)}">${bars}<line x1="${zero}" x2="${zero}" y1="0" y2="${H}" class="base"/></svg>`;
}

function regionChart(m: ReportModel) {
  const ids = [...new Set(m.regions.flatMap((r) => r.values.map((v) => v.retailer)))];
  if (!ids.length) return '';
  const W = 680;
  const barH = 12;
  const group = ids.length * (barH + 2) + 12;
  const H = m.regions.length * group + 8;
  const labelW = 120;
  const max = Math.max(1, ...m.regions.flatMap((r) => r.values.map((v) => v.cost ?? 0)));
  const x = (v: number) => labelW + (v / max) * (W - labelW - 70);
  const body = m.regions
    .map((r, gi) => {
      const y0 = 4 + gi * group;
      return (
        `<text x="${labelW - 8}" y="${y0 + (ids.length * (barH + 2)) / 2 + 3}" class="cat" text-anchor="end">${esc(r.name)}</text>` +
        r.values
          .map((v, i) => {
            const y = y0 + i * (barH + 2);
            const name = retailer(v.retailer).name;
            return v.cost === null
              ? ''
              : `${hbar(labelW, x(v.cost), y, barH, retailer(v.retailer).color, `${name}, ${r.name}: ${money(v.cost)}`)}<text x="${x(v.cost) + 6}" y="${y + 10}" class="dlabel">${money(v.cost)}</text>`;
          })
          .join('')
      );
    })
    .join('');
  return `${legendSwatches(ids)}<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Basket cost by region on the last day">${body}<line x1="${labelW}" x2="${labelW}" y1="0" y2="${H - 4}" class="base"/></svg>`;
}

function legendSwatches(ids: string[]) {
  return `<div class="legend">${ids.map((id) => `<span><i style="background:${retailer(id).color}"></i>${esc(retailer(id).name)}</span>`).join('')}</div>`;
}

/** One table per horizon: the biggest rises, then the biggest falls. */
function moverTable(
  movers: ReportModel['movers30'],
  hasHistory: boolean,
  period: string,
  horizon: string,
) {
  if (!hasHistory) return `<p class="muted">No ${esc(horizon)} history yet.</p>`;
  const rows = (list: ReportModel['movers30']['up'], title: string, empty: string) =>
    `<tr class="group"><td colspan="5">${esc(title)}</td></tr>` +
    (list.length
      ? list
          .map(
            (c) =>
              `<tr><td>${esc(c.item.name)} <span class="muted">${esc(sizeLabel(c.item))}</span></td><td>${esc(retailer(c.retailer).name)}</td><td class="num">${money(c.from)}</td><td class="num">${money(c.to)}</td><td class="num">${pct(c.pct)}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="5" class="muted">${esc(empty)}</td></tr>`);
  return `<table class="small"><thead><tr><th>Item</th><th>Retailer</th><th class="num">From</th><th class="num">To</th><th class="num">Change</th></tr></thead><tbody>${rows(movers.up, 'Rose most', `No item rose over ${period}.`)}${rows(movers.down, 'Fell most', `No item fell over ${period}.`)}</tbody></table>`;
}

const STYLES = `
:root { --ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --plane:#f9f9f7; --surface:#ffffff; --border:rgba(11,11,11,.10); }
@page { size: Letter; margin: 0.55in 0.6in 0.6in; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: var(--surface); color: var(--ink); font: 10.5pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 7.3in; margin: 0 auto; padding: 0 16px; }
h1 { font-size: 22pt; line-height: 1.15; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 13pt; margin: 22px 0 6px; padding-top: 6px; border-top: 1px solid var(--grid); break-after: avoid; }
h3 { font-size: 10.5pt; margin: 14px 0 4px; break-after: avoid; }
p { margin: 4px 0 8px; }
.muted { color: var(--muted); }
.sub { color: var(--ink2); margin-bottom: 10px; }
.banner { border: 1.5px solid #d03b3b; border-radius: 6px; padding: 8px 12px; margin: 10px 0 14px; color: var(--ink); background: #fdf3f3; }
.banner b { color: #a32626; }
.note { border-left: 3px solid var(--axis); padding: 4px 10px; color: var(--ink2); font-size: 9pt; margin: 8px 0; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 6px; }
.tile { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: var(--plane); break-inside: avoid; }
.tile .k { font-size: 8.5pt; color: var(--ink2); }
.tile .v { font-size: 16pt; font-weight: 650; line-height: 1.2; }
.tile .n { font-size: 8pt; color: var(--ink2); font-variant-numeric: tabular-nums; }
.lede { font-size: 11pt; }
.chart { width: 100%; height: auto; display: block; overflow: visible; }
.chart .grid { stroke: var(--grid); stroke-width: 1; }
.chart .base { stroke: var(--axis); stroke-width: 1; }
.chart .tick { fill: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.chart .dlabel { fill: var(--ink2); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.chart .cat { fill: var(--ink); font-size: 10.5px; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 9pt; color: var(--ink2); margin: 4px 0 6px; }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.figure { break-inside: avoid; margin: 6px 0 4px; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 4px 0 10px; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { text-align: left; font-weight: 600; color: var(--ink2); border-bottom: 1px solid var(--axis); padding: 4px 6px; vertical-align: bottom; }
td { border-bottom: 1px solid var(--grid); padding: 3px 6px; }
tr.group td { font-weight: 650; color: var(--ink2); background: var(--plane); padding-top: 6px; }
.nowrap { white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.best { font-weight: 650; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cols > div { min-width: 0; }
.small { font-size: 8.5pt; }
footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid var(--grid); color: var(--muted); font-size: 8.5pt; }
.pb { break-before: page; }
.keep { break-inside: avoid; }
@media screen { body { background: var(--plane); } main { background: var(--surface); padding: 28px 32px 40px; margin: 16px auto; border: 1px solid var(--border); border-radius: 8px; } }
@media screen and (max-width: 640px) { .tiles { grid-template-columns: repeat(2, 1fr); } .cols { grid-template-columns: 1fr; } main { padding: 18px 16px; margin: 0; border: 0; border-radius: 0; } }
`;

export function renderReport(m: ReportModel): string {
  const t = m.totals;
  const name = (id: string) => retailer(id).name;
  const has1y =
    m.basketSeries.some((s) => s.pct1y !== null) || m.priceTable.some((r) => r.pct1y !== null);
  const moved = (p: number | null, period: string) =>
    p === null
      ? `has no ${period} comparison`
      : `${p >= 0 ? 'rose' : 'fell'} ${Math.abs(p).toFixed(1)}% over ${period}`;
  const lede = [
    `The ${m.basketItems.length}-item basket ${m.basketSeries.map((s) => `${moved(s.pct30, '30 days')} and ${moved(s.pct1y, 'the year')} at ${name(s.retailer)} (now ${money(s.now)})`).join('; ')}.`,
    m.diesel
      ? `U.S. diesel is ${money(m.diesel.now)} a gallon: ${pct(m.diesel.pct30)} over 30 days and ${pct(m.diesel.pct1y)} over the year.`
      : '',
    `In the last 30 days the bot recorded ${t.increases.toLocaleString('en-US')} shelf-price increases and ${t.decreases.toLocaleString('en-US')} decreases across sampled stores.`,
  ].join(' ');

  const tiles = [
    [
      'Prices collected',
      t.observations.toLocaleString('en-US'),
      `last 30 days · ${m.year.published.toLocaleString('en-US')} in the year`,
    ],
    [
      'Collecting since',
      m.firstDay ? dateLabel(m.firstDay, { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
      `${m.year.daysRun} of ${m.year.days} days run`,
    ],
    ['Average coverage', `${t.avgCoverage.toFixed(1)}%`, 'item × retailer pairs, 30 days'],
    ['Held for review', String(t.held), 'last 30 days'],
    ...m.basketSeries.map((s) => [
      `${name(s.retailer)} basket`,
      money(s.now),
      `30d ${pct(s.pct30)} · 1y ${pct(s.pct1y)}`,
    ]),
    [
      'U.S. diesel / gal',
      m.diesel ? money(m.diesel.now) : '—',
      m.diesel ? `30d ${pct(m.diesel.pct30)} · 1y ${pct(m.diesel.pct1y)}` : 'not available',
    ],
  ]
    .map(
      ([k, v, n]) =>
        `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="n">${esc(n)}</div></div>`,
    )
    .join('');

  const glanceRows = [
    ...m.basketSeries.map(
      (s) =>
        `<tr><td>${esc(name(s.retailer))} basket (${m.basketItems.length} items)</td><td class="num">${money(s.now)}</td><td class="num">${money(s.cost30)}</td><td class="num">${pct(s.pct30)}</td><td class="num">${money(s.cost1y)}</td><td class="num">${pct(s.pct1y)}</td></tr>`,
    ),
    ...m.scorecard.map(
      (r) =>
        `<tr><td>${esc(name(r.retailer))}, average item (${r.itemsCarried})</td><td class="num">—</td><td class="num">—</td><td class="num">${pct(r.avgItem30)}</td><td class="num">—</td><td class="num">${pct(r.avgItem1y)}</td></tr>`,
    ),
    m.diesel
      ? `<tr><td>U.S. diesel, per gallon</td><td class="num">${money(m.diesel.now)}</td><td class="num">${money(m.diesel.ago30)}</td><td class="num">${pct(m.diesel.pct30)}</td><td class="num">${money(m.diesel.ago1y)}</td><td class="num">${pct(m.diesel.pct1y)}</td></tr>`
      : '',
  ].join('');
  const glance = `<table><thead><tr><th></th><th class="num">${esc(dateLabel(m.to))}</th><th class="num">30 days ago</th><th class="num">30-day change</th><th class="num">1 year ago</th><th class="num">1-year change</th></tr></thead><tbody>${glanceRows}</tbody></table>`;

  const historyNote = has1y
    ? ''
    : `<div class="note">1-year changes need prices from ${esc(longDate(m.yearStart))}. ${m.firstDay ? `Collection started ${esc(longDate(m.firstDay))}, so they show as “—” until then.` : ''}</div>`;

  const monthly = `<table class="small"><thead><tr><th>Month</th>${m.basketSeries.map((s) => `<th class="num">${esc(name(s.retailer))}</th>`).join('')}</tr></thead><tbody>${m.yearDays
    .map((day, i) => ({ day, i }))
    .filter(
      ({ day, i }) =>
        (day.endsWith('-01') || i === 0 || i === m.yearDays.length - 1) &&
        m.basketSeries.some((s) => s.year.cost[i] !== null),
    )
    .map(
      ({ day, i }) =>
        `<tr><td>${esc(dateLabel(day, { month: 'short', day: 'numeric', year: 'numeric' }))}</td>${m.basketSeries.map((s) => `<td class="num">${money(s.year.cost[i]!)}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody></table>`;

  const scorecard = `<table><thead><tr><th>Retailer</th><th class="num">Items</th><th class="num">Stores</th><th class="num">Basket</th><th class="num">Basket 30d</th><th class="num">Basket 1y</th><th class="num">On promo</th><th class="num">Out of stock</th></tr></thead><tbody>${m.scorecard
    .map(
      (r) =>
        `<tr><td>${esc(name(r.retailer))}</td><td class="num">${r.itemsCarried}</td><td class="num">${r.stores || 'online'}</td><td class="num">${money(r.basketCost)}</td><td class="num">${pct(r.basket30)}</td><td class="num">${pct(r.basket1y)}</td><td class="num">${share(r.promoShare)}</td><td class="num">${share(r.outOfStock)}</td></tr>`,
    )
    .join(
      '',
    )}</tbody></table><p class="small muted">On promo: share of items with a promotional price on ${esc(dateLabel(m.to))}. Out of stock: share of observations in the last 30 days.</p>`;

  const shrinks = m.shrinks.length
    ? `<table class="small"><thead><tr><th>Item</th><th>Retailer</th><th>First seen</th><th>Size</th><th class="num">Shelf price</th><th>Regions</th></tr></thead><tbody>${m.shrinks
        .map((e) => {
          const item = m.priceTable.find((p) => p.item.id === e.item_id)?.item;
          return `<tr><td>${esc(item?.name ?? e.item_id)}</td><td>${esc(retailer(e.retailer_id)?.name ?? e.retailer_id)}</td><td class="nowrap">${esc(dateLabel(e.day, { month: 'short', day: 'numeric', year: 'numeric' }))}</td><td class="nowrap">${esc((e.tag ?? '').replace(/_/g, ' '))}</td><td class="num">${money(Number(e.to_price))}</td><td>${esc([...new Set(e.regions)].map((r) => (r === 'nat' ? 'Online' : (PADD_NAMES[r] ?? r))).join(', '))}</td></tr>`;
        })
        .join(
          '',
        )}</tbody></table><p class="small muted">The same product, same shelf price, smaller package: the unit price rises without a price change on the shelf tag.</p>`
    : '<p class="muted">No package-size changes in the past year.</p>';

  const reasons: Record<string, string> = {
    out_of_band: 'Outside the expected price range (for example a misplaced decimal)',
    price_jump: 'Moved more than 40% from the previous price',
    low_confidence: 'Uncertain product match',
    size_change: 'Size change',
  };
  const review = m.reviewReasons.length
    ? `<table class="small"><thead><tr><th>Reason</th><th class="num">Held</th></tr></thead><tbody>${m.reviewReasons.map(([r, n]) => `<tr><td>${esc(reasons[r] ?? r)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nothing was held for review.</p>';

  const runs = `<table class="small"><thead><tr><th>Day</th><th>Run</th><th class="num">Coverage</th><th class="num">Prices published</th><th class="num">Held</th><th class="num">Failed fetches</th></tr></thead><tbody>${m.runRows
    .map(
      (r) =>
        `<tr><td>${esc(dateLabel(r.day, { weekday: 'short', month: 'short', day: 'numeric' }))}</td><td>${esc(r.status)}</td><td class="num">${r.coverage === null ? '—' : `${r.coverage.toFixed(1)}%`}</td><td class="num">${r.published.toLocaleString('en-US')}</td><td class="num">${r.held}</td><td class="num">${r.failedTasks}/${r.tasks}</td></tr>`,
    )
    .join('')}</tbody></table>`;

  const categoryTable = `<table class="small"><thead><tr><th>Category</th><th class="num">30-day change</th><th class="num">1-year change</th><th class="num">Item × retailer pairs</th></tr></thead><tbody>${m.categories
    .map(
      (c) =>
        `<tr><td>${esc(c.category)}</td><td class="num">${pct(c.pct30, 2)}</td><td class="num">${pct(c.pct1y, 2)}</td><td class="num">${Math.max(c.n30, c.n1y)}</td></tr>`,
    )
    .join('')}</tbody></table>`;

  const appendix = `<table class="small"><thead><tr><th>Item</th><th>Size</th>${m.retailerIds.map((r) => `<th class="num">${esc(name(r))}</th>`).join('')}<th class="num">30-day</th><th class="num">1-year</th></tr></thead><tbody>${[
    ...new Set(m.priceTable.map((r) => r.item.category)),
  ]
    .map(
      (category) =>
        `<tr class="group"><td colspan="${m.retailerIds.length + 4}">${esc(category)}</td></tr>` +
        m.priceTable
          .filter((row) => row.item.category === category)
          .map(
            (row) =>
              `<tr><td>${esc(row.item.name)}</td><td class="nowrap">${esc(sizeLabel(row.item))}</td>${row.cells
                .map(
                  (c) =>
                    `<td class="num${row.cheapest.includes(c.retailer) ? ' best' : ''}">${money(c.price)}</td>`,
                )
                .join(
                  '',
                )}<td class="num">${pct(row.pct30)}</td><td class="num">${pct(row.pct1y)}</td></tr>`,
          )
          .join(''),
    )
    .join('')}</tbody></table>`;

  const anchorNote = [
    m.anchors.d30
      ? `30 days ago = ${dateLabel(m.anchors.d30, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : '30-day comparison unavailable',
    m.anchors.y1
      ? `1 year ago = ${dateLabel(m.anchors.y1, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : '1-year comparison unavailable',
  ].join(' · ');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DieselDelta Price Report</title>
<style>${STYLES}</style></head>
<body><main>
<h1>DieselDelta Price Report</h1>
<div class="sub">30-day and 1-year price changes to ${esc(longDate(m.to))} · Generated ${esc(new Date(m.generatedAt).toUTCString().replace(' GMT', ' UTC'))}</div>
${m.simulated ? `<div class="banner"><b>Simulated data.</b> Every price in this report comes from the mock Kroger, Walmart and Amazon retailers used to develop the price bot (sources: ${esc(m.sources.join(', '))}). They are generated, not real shelf prices, and must not be quoted or published.</div>` : `<div class="sub">Sources: ${esc(m.sources.join(', '))}</div>`}
<p class="lede">${esc(lede)}</p>
<div class="tiles">${tiles}</div>
${historyNote}

<h2>Price changes at a glance</h2>
${glance}
<p class="small muted">National prices: the median across each retailer's sampled stores (Amazon is online). Basket items: ${esc(m.basketItems.map((i) => i.name).join(', '))}. ${esc(anchorNote)}.</p>

<section class="keep">
<h2>Basket over the past year</h2>
<p>The same ${m.basketItems.length} default-basket items at each retailer, indexed to 100 on the first complete day of the year.</p>
<div class="figure">${lineChart({ days: m.yearDays, series: m.basketSeries.map((s) => ({ retailer: s.retailer, ...s.year })), ticks: 'month', label: `Basket index by retailer, ${m.yearStart} to ${m.to}` })}</div>
</section>
<h3>Basket cost, monthly</h3>
${monthly}

<section class="keep">
<h2>Basket over the last 30 days</h2>
<p>The same basket, indexed to 100 on ${esc(longDate(m.from30))}.</p>
<div class="figure">${lineChart({ days: m.days30, series: m.basketSeries.map((s) => ({ retailer: s.retailer, ...s.window })), ticks: 'days', label: `Basket index by retailer, ${m.from30} to ${m.to}` })}</div>
</section>

<h2>Retailers</h2>
${scorecard}
<h3>Basket cost by region, ${esc(dateLabel(m.to))}</h3>
<p class="small muted">Median across the two sampled stores in each region. Amazon has one online price nationwide, so it isn't shown here.</p>
<div class="figure">${regionChart(m)}</div>

<section class="keep">
<h2>Categories</h2>
<p>Average change across every item and retailer in the category, sorted by the 1-year change. Each chart has its own scale; the table gives both side by side.</p>
<div class="legend"><span><i style="background:#e34948"></i>Prices rose</span><span><i style="background:#2a78d6"></i>Prices fell</span></div>
<div class="cols figure"><div><h3>Last 30 days</h3>${categoryChart(
    m.categories.map((c) => ({ category: c.category, pct: c.pct30, n: c.n30 })),
    'last 30 days',
  )}</div><div><h3>Past year</h3>${categoryChart(
    m.categories.map((c) => ({ category: c.category, pct: c.pct1y, n: c.n1y })),
    'past year',
  )}</div></div>
</section>
${categoryTable}

<h2>Biggest movers</h2>
<p class="small muted">National price, item by item. Moves under $0.03 or 0.5% are ignored.</p>
<h3>Last 30 days</h3>
${moverTable(
  m.movers30,
  m.priceTable.some((r) => r.pct30 !== null),
  '30 days',
  '30-day',
)}
<h3>Past year</h3>
${moverTable(
  m.movers1y,
  m.priceTable.some((r) => r.pct1y !== null),
  'the year',
  '1-year',
)}

<h2>Shrinkflation, past year</h2>
${shrinks}

<h2>Data quality</h2>
<div class="cols"><div>
<h3>Held for review, last 30 days</h3>
${review}
<p class="small muted">Held prices are not published until a person approves them.</p>
</div><div>
<h3>How prices are collected</h3>
<p class="small">The bot prices each item daily at about 10 sampled stores per store-priced retailer (2 per PADD region) and online for Amazon. It matches each retailer product to the catalog by brand, size and name; it identifies itself, follows robots.txt and rate limits, and stops a source that blocks it. Shelf and promotional prices are kept separately; this report uses shelf prices.</p>
<p class="small">Past year: ${m.year.daysRun} of ${m.year.days} days run, ${m.year.published.toLocaleString('en-US')} prices published${m.year.avgCoverage === null ? '' : `, ${m.year.avgCoverage.toFixed(1)}% average coverage`}.</p>
</div></div>
<h3>Daily runs, last 30 days</h3>
${runs}

<h2 class="pb">Appendix: all ${m.priceTable.length} items, ${esc(dateLabel(m.to))}</h2>
<p class="small muted">National shelf price on ${esc(dateLabel(m.to))}; the cheapest retailer (or retailers, when tied) is in bold, and "—" means the retailer doesn't carry it. 30-day and 1-year columns are the average change across retailers.</p>
${appendix}

<footer>DieselDelta price bot · ${esc(m.sources.join(', '))} · to ${esc(m.to)}${m.simulated ? ' · SIMULATED DATA' : ''}</footer>
</main></body></html>`;
}

// ---------- loading and output ----------

/** National prices on the target day, or the nearest day with data within a week either side. */
async function pricesOn(db: BotDb, target: string): Promise<PricesOn> {
  for (const offset of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7]) {
    const day = addDays(target, offset);
    const { data, error } = await db.client.rpc('item_prices_on', { p_days: [day] });
    if (error) throw new Error(`item_prices_on: ${error.message}`);
    const rows = (data ?? []) as PricePoint[];
    if (rows.length) {
      return { target, day, prices: rows.map((r) => ({ ...r, price: Number(r.price) })) };
    }
  }
  return { target, day: null, prices: [] };
}

export async function loadReportData(
  db: BotDb,
  items: CanonicalItem[],
  to: string,
): Promise<ReportData> {
  const from30 = addDays(to, -(WINDOW_DAYS - 1));
  const next = addDays(to, 1);
  const yearStart = addDays(to, -YEAR_DAYS);

  const [end, d30, y1] = [
    await pricesOn(db, to),
    await pricesOn(db, addDays(to, -WINDOW_DAYS)),
    await pricesOn(db, yearStart),
  ];
  if (end.day && end.day > to) end.day = null;

  // The basket: default-basket items every retailer prices today, so baskets compare like with like.
  const retailersNow = [...new Set(end.prices.map((p) => p.retailer_id))];
  const pricedBy = new Set(end.prices.map((p) => `${p.item_id}|${p.retailer_id}`));
  const basketItems = items
    .filter((i) => i.inDefaultBasket && retailersNow.every((r) => pricedBy.has(`${i.id}|${r}`)))
    .map((i) => i.id);
  const byRetailer: Record<string, BasketDay[]> = {};
  for (const r of retailersNow) {
    const { data, error } = await db.client.rpc('basket_daily', {
      p_from: yearStart,
      p_to: to,
      p_items: basketItems,
      p_retailer: r,
    });
    if (error) throw new Error(`basket_daily: ${error.message}`);
    byRetailer[r] = ((data ?? []) as BasketDay[]).map((b) => ({ ...b, cost: Number(b.cost) }));
  }

  const [observations, stores, events, reviews, runs, sources] = await Promise.all([
    db.observations(
      from30,
      next,
      'item_id,retailer_id,store_id,source_id,day,regular_price,promo_price,in_stock',
    ),
    db.stores(),
    db.events(yearStart, next),
    db.reviews(from30, next),
    db.runs(JOB),
    db.sources(),
  ]);

  let diesel: ReportData['diesel'] = [];
  const { data } = await db.client.rpc('fuel_series_daily', {
    p_area: 'NUS',
    p_kind: 'diesel',
    p_days: YEAR_DAYS + 60,
  });
  if (Array.isArray(data)) {
    diesel = (data as { day: string; price_usd_per_gal: number | string }[])
      .filter((r) => r.day <= to)
      .map((r) => ({ day: r.day, price: Number(r.price_usd_per_gal) }));
  }

  return {
    to,
    items,
    observations,
    stores,
    events,
    reviews,
    runs,
    sources,
    diesel,
    prices: { end, d30, y1 },
    basket: { items: basketItems, byRetailer },
    generatedAt: new Date().toISOString(),
  };
}

/** Prints the HTML to a Letter-size PDF with Chromium (Playwright). */
export async function writePdf(html: string, path: string) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path,
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font:8px system-ui,sans-serif;color:#898781;padding:0 0.6in;display:flex;justify-content:space-between"><span>DieselDelta Price Report</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
  } finally {
    await browser.close();
  }
}
