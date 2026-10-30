// Printable price report: reads what the bot collected for a period and renders an HTML page (and
// a PDF through Chromium). buildReport() is pure so it can be tested; renderReport() draws it.
import type { CanonicalItem } from './catalog';
import { sizeLabel } from './catalog';
import type { BotDb, ObservationRow, PriceEventRow, SourceRow, StoreRow } from './db';
import { JOB } from './pipeline';

export type ReportData = {
  from: string;
  /** Inclusive last day. */
  to: string;
  items: CanonicalItem[];
  observations: ObservationRow[];
  stores: StoreRow[];
  events: PriceEventRow[];
  reviews: { reason: string; day: string; retailer_id: string }[];
  runs: { id: number; status: string; detail: Record<string, unknown> | null }[];
  sources: SourceRow[];
  /** U.S. diesel, daily, if available. */
  diesel: { day: string; price: number }[];
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

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= to;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Hysteresis from FEATURES.md: ignore moves under $0.03 or 0.5%. */
const isChange = (a: number, b: number) => Math.abs(b - a) >= 0.03 && Math.abs(b / a - 1) >= 0.005;

export function buildReport(d: ReportData) {
  const days = daysBetween(d.from, d.to);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const itemById = new Map(d.items.map((i) => [i.id, i]));
  const storeById = new Map(d.stores.map((s) => [s.id, s]));
  const retailerIds = RETAILERS.map((r) => r.id as string).filter((r) =>
    d.observations.some((o) => o.retailer_id === r),
  );

  // National price per item × retailer × day: the median across sampled stores (or the online price).
  const byIRD = new Map<string, number[]>();
  for (const o of d.observations) {
    const k = `${o.item_id}|${o.retailer_id}|${o.day}`;
    (byIRD.get(k) ?? byIRD.set(k, []).get(k)!).push(Number(o.regular_price));
  }
  const price = (item: string, retailer: string, day: string) => {
    const xs = byIRD.get(`${item}|${retailer}|${day}`);
    return xs ? median(xs) : null;
  };

  /** First and last day in the period with a price, per item × retailer. */
  const endpoints = (item: string, retailer: string) => {
    type Point = { day: string; p: number };
    let a: Point | null = null;
    let b: Point | null = null;
    for (const day of days) {
      const p = price(item, retailer, day);
      if (p === null) continue;
      if (!a) a = { day, p };
      b = { day, p };
    }
    return a && b ? { start: a, end: b } : null;
  };

  // The basket: default-basket items every retailer carries, so baskets compare like with like.
  const basketItems = d.items
    .filter((i) => i.inDefaultBasket)
    .filter((i) => retailerIds.every((r) => endpoints(i.id, r)))
    .map((i) => i.id);
  const basketSeries = retailerIds.map((r) => {
    let lastKnown = new Map<string, number>();
    const values = days.map((day) => {
      const next = new Map(lastKnown);
      for (const id of basketItems) {
        const p = price(id, r, day);
        if (p !== null) next.set(id, p);
      }
      lastKnown = next;
      return basketItems.every((id) => next.has(id))
        ? basketItems.reduce((s, id) => s + next.get(id)!, 0)
        : null;
    });
    const base = values.find((v) => v !== null) ?? null;
    return {
      retailer: r,
      cost: values,
      index: values.map((v) => (v === null || base === null ? null : (v / base) * 100)),
    };
  });

  // Item changes over the period, per retailer.
  const changes = d.items.flatMap((item) =>
    retailerIds.flatMap((r) => {
      const e = endpoints(item.id, r);
      if (!e) return [];
      return [
        { item, retailer: r, from: e.start.p, to: e.end.p, pct: (e.end.p / e.start.p - 1) * 100 },
      ];
    }),
  );
  const movers = changes.filter((c) => isChange(c.from, c.to));
  const topUp = [...movers]
    .filter((c) => c.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);
  const topDown = [...movers]
    .filter((c) => c.pct < 0)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 10);

  const categories = [...new Set(d.items.map((i) => i.category))]
    .map((category) => {
      const cs = changes.filter((c) => c.item.category === category);
      return { category, pct: cs.reduce((s, c) => s + c.pct, 0) / (cs.length || 1), n: cs.length };
    })
    .sort((a, b) => b.pct - a.pct);

  // Shelf-price changes at store level, day over day, with the hysteresis filter.
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

  // Retailer scorecard on the last day.
  const lastObs = d.observations.filter((o) => o.day === last);
  const scorecard = retailerIds.map((r) => {
    const rows = lastObs.filter((o) => o.retailer_id === r);
    const all = d.observations.filter((o) => o.retailer_id === r);
    const series = basketSeries.find((s) => s.retailer === r)!;
    const cost = [...series.cost].reverse().find((v) => v !== null) ?? null;
    const startCost = series.cost.find((v) => v !== null) ?? null;
    return {
      retailer: r,
      itemsCarried: new Set(rows.map((o) => o.item_id)).size,
      stores: new Set(rows.map((o) => o.store_id).filter((s) => s !== null)).size,
      basketCost: cost,
      basketPct: cost !== null && startCost ? (cost / startCost - 1) * 100 : null,
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
        const perItem = basketItems.map((id) =>
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
        return {
          retailer: r,
          cost: perItem.every((p) => !Number.isNaN(p)) ? perItem.reduce((s, p) => s + p, 0) : null,
        };
      }),
  }));

  const shrinks = d.events
    .filter((e) => e.kind === 'size_change')
    .reduce<Map<string, PriceEventRow & { regions: string[] }>>((m, e) => {
      const k = `${e.item_id}|${e.retailer_id}|${e.tag}`;
      const prev = m.get(k);
      if (prev) prev.regions.push(e.region);
      else m.set(k, { ...e, regions: [e.region] });
      return m;
    }, new Map());

  const runsInPeriod = d.runs
    .filter(
      (r) =>
        typeof r.detail?.day === 'string' &&
        (r.detail.day as string) >= first &&
        (r.detail.day as string) <= last,
    )
    .sort((a, b) => String(a.detail!.day).localeCompare(String(b.detail!.day)) || a.id - b.id);
  // The latest run per day is the one that counts.
  const runByDay = new Map(runsInPeriod.map((r) => [String(r.detail!.day), r]));
  const runRows = days.map((day) => {
    const r = runByDay.get(day);
    const det = (r?.detail ?? {}) as {
      coverage?: { pct: number };
      sources?: Record<
        string,
        { tasks: number; failedTasks: number; published: number; held: number }
      >;
    };
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
  });

  const reviewReasons = [
    ...d.reviews.reduce(
      (m, r) => m.set(r.reason, (m.get(r.reason) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ];

  const dieselIn = d.diesel.filter((x) => x.day >= first && x.day <= last);
  const diesel =
    dieselIn.length >= 2
      ? {
          from: dieselIn[0]!.price,
          to: dieselIn[dieselIn.length - 1]!.price,
          pct: (dieselIn[dieselIn.length - 1]!.price / dieselIn[0]!.price - 1) * 100,
        }
      : null;

  const usedSources = new Set(d.observations.map((o) => o.source_id));
  const simulated = [...usedSources].some(
    (s) => d.sources.find((x) => x.id === s)?.kind === 'mock',
  );

  const priceTable = d.items.map((item) => {
    const cells = retailerIds.map((r) => {
      const e = endpoints(item.id, r);
      return {
        retailer: r,
        price: e?.end.p ?? null,
        pct: e ? (e.end.p / e.start.p - 1) * 100 : null,
      };
    });
    const present = cells.filter((c) => c.price !== null).map((c) => c.price!);
    const low = present.length > 1 ? Math.min(...present) : null;
    // Every retailer at the lowest price is marked, so ties show as ties.
    const cheapest = cells.filter((c) => low !== null && c.price === low).map((c) => c.retailer);
    return { item, cells, cheapest };
  });

  return {
    from: first,
    to: last,
    days,
    generatedAt: d.generatedAt,
    simulated,
    sources: [...usedSources].sort(),
    retailerIds,
    totals: {
      items: d.items.length,
      observations: d.observations.length,
      stores: new Set(d.observations.map((o) => o.store_id).filter((s) => s !== null)).size,
      increases,
      decreases,
      shrinks: shrinks.size,
      held: d.reviews.length,
      avgCoverage: runRows
        .filter((r) => r.coverage !== null)
        .reduce((s, r, _, a) => s + r.coverage! / a.length, 0),
      daysMissing: runRows.filter((r) => r.status !== 'succeeded').length,
    },
    basketItems: basketItems.map((id) => itemById.get(id)!),
    basketSeries,
    diesel,
    categories,
    topUp,
    topDown,
    scorecard,
    regions,
    shrinks: [...shrinks.values()],
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

function basketChart(m: ReportModel) {
  const W = 680;
  const H = 250;
  const pad = { l: 40, r: 128, t: 10, b: 26 };
  const vals = m.basketSeries.flatMap((s) => s.index.filter((v): v is number => v !== null));
  if (!vals.length) return '<p class="muted">No basket data in this period.</p>';
  const ticks = niceTicks(Math.min(...vals, 100), Math.max(...vals, 100), 4);
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const decimals = ticks.some((t) => t % 1) ? 1 : 0;
  const x = (i: number) => pad.l + (i / Math.max(1, m.days.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const grid = ticks
    .map(
      (t) =>
        `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" class="${t === 100 ? 'base' : 'grid'}"/><text x="${pad.l - 6}" y="${y(t) + 3.5}" class="tick" text-anchor="end">${t.toFixed(decimals)}</text>`,
    )
    .join('');
  const step = Math.max(1, Math.round(m.days.length / 6));
  const xt = m.days
    .map((day, i) =>
      i % step === 0 || i === m.days.length - 1
        ? `<text x="${x(i)}" y="${H - 8}" class="tick" text-anchor="middle">${dateLabel(day)}</text>`
        : '',
    )
    .join('');
  const lines = m.basketSeries
    .map((s) => {
      const r = retailer(s.retailer);
      const pts = s.index
        .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
        .filter(Boolean);
      const dots = s.index
        .map((v, i) =>
          v === null
            ? ''
            : `<circle cx="${x(i)}" cy="${y(v)}" r="5" fill="transparent"><title>${esc(r.name)} · ${dateLabel(m.days[i]!)}: ${v.toFixed(1)} (${money(s.cost[i]!)})</title></circle>`,
        )
        .join('');
      return `<polyline points="${pts.join(' ')}" fill="none" stroke="${r.color}" stroke-width="2" stroke-dasharray="${r.dash}" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
    })
    .join('');
  // Direct labels at the line ends, nudged apart so they never overlap.
  const ends = m.basketSeries
    .map((s) => {
      const lastIdx = s.index
        .map((v, i) => (v === null ? -1 : i))
        .reduce((a, b) => Math.max(a, b), -1);
      return lastIdx < 0 ? null : { s, v: s.index[lastIdx]!, i: lastIdx, ly: y(s.index[lastIdx]!) };
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
  return `${legend(m.basketSeries.map((s) => s.retailer))}<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Basket index by retailer, ${esc(m.from)} to ${esc(m.to)}, 100 = first day">${grid}${xt}${lines}${labels}</svg>`;
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

function categoryChart(m: ReportModel) {
  const W = 680;
  const row = 22;
  const H = m.categories.length * row + 26;
  const labelW = 120;
  const valueW = 64;
  // The domain always includes zero; one-sided data uses the whole width.
  const lo = Math.min(0, ...m.categories.map((c) => c.pct));
  const hi = Math.max(0, ...m.categories.map((c) => c.pct));
  const span = hi - lo || 1;
  const x0 = labelW + (lo < 0 ? valueW : 4);
  const plot = W - x0 - (hi > 0 ? valueW : 4);
  const x = (v: number) => x0 + ((v - lo) / span) * plot;
  const zero = x(0);
  const bars = m.categories
    .map((c, i) => {
      const y = 6 + i * row;
      const fill = c.pct >= 0 ? '#e34948' : '#2a78d6';
      const tx = c.pct >= 0 ? x(c.pct) + 6 : x(c.pct) - 6;
      return `<text x="${labelW - 8}" y="${y + 11}" class="cat" text-anchor="end">${esc(c.category)}</text>${hbar(zero, x(c.pct), y, 14, fill, `${c.category}: ${pct(c.pct, 2)} (${c.n} item-retailer pairs)`)}<text x="${tx}" y="${y + 11}" class="dlabel" text-anchor="${c.pct >= 0 ? 'start' : 'end'}">${pct(c.pct, 2)}</text>`;
    })
    .join('');
  return `<div class="legend"><span><i style="background:#e34948"></i>Prices rose</span><span><i style="background:#2a78d6"></i>Prices fell</span></div><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Average price change by category">${bars}<line x1="${zero}" x2="${zero}" y1="0" y2="${H - 20}" class="base"/></svg>`;
}

function regionChart(m: ReportModel) {
  const ids = [...new Set(m.regions.flatMap((r) => r.values.map((v) => v.retailer)))];
  if (!ids.length) return '';
  const W = 680;
  const barH = 12;
  const group = ids.length * (barH + 2) + 12;
  const H = m.regions.length * group + 8;
  const labelW = 120;
  const max = Math.max(...m.regions.flatMap((r) => r.values.map((v) => v.cost ?? 0)));
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

function changeTable(rows: ReportModel['topUp'], empty: string) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<table><thead><tr><th>Item</th><th>Size</th><th>Retailer</th><th class="num">From</th><th class="num">To</th><th class="num">Change</th></tr></thead><tbody>${rows
    .map(
      (c) =>
        `<tr><td>${esc(c.item.name)}</td><td>${esc(sizeLabel(c.item))}</td><td>${esc(retailer(c.retailer).name)}</td><td class="num">${money(c.from)}</td><td class="num">${money(c.to)}</td><td class="num">${pct(c.pct)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
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
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 6px; }
.tile { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: var(--plane); break-inside: avoid; }
.tile .k { font-size: 8.5pt; color: var(--ink2); }
.tile .v { font-size: 16pt; font-weight: 650; line-height: 1.2; }
.tile .n { font-size: 8pt; color: var(--muted); }
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
th { text-align: left; font-weight: 600; color: var(--ink2); border-bottom: 1px solid var(--axis); padding: 4px 6px; }
td { border-bottom: 1px solid var(--grid); padding: 3px 6px; }
.nowrap { white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.best { font-weight: 650; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.small { font-size: 8.5pt; }
footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid var(--grid); color: var(--muted); font-size: 8.5pt; }
.pb { break-before: page; }
@media screen { body { background: var(--plane); } main { background: var(--surface); padding: 28px 32px 40px; margin: 16px auto; border: 1px solid var(--border); border-radius: 8px; } }
@media screen and (max-width: 640px) { .tiles { grid-template-columns: repeat(2, 1fr); } .cols { grid-template-columns: 1fr; } main { padding: 18px 16px; margin: 0; border: 0; border-radius: 0; } }
`;

export function renderReport(m: ReportModel): string {
  const t = m.totals;
  const range = `${dateLabel(m.from, { month: 'long', day: 'numeric', year: 'numeric' })} – ${dateLabel(m.to, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const basketWord = (r: (typeof m.scorecard)[number]) =>
    r.basketPct === null
      ? 'had no complete basket'
      : `${r.basketPct >= 0 ? 'rose' : 'fell'} ${pct(Math.abs(r.basketPct))} to ${money(r.basketCost)}`;
  const lede = [
    `Over ${m.days.length} days the ${m.basketItems.length}-item basket ${m.scorecard.map((r) => `${basketWord(r)} at ${retailer(r.retailer).name}`).join(', ')}.`,
    m.diesel
      ? `U.S. diesel went from ${money(m.diesel.from)} to ${money(m.diesel.to)} a gallon (${pct(m.diesel.pct)}).`
      : '',
    `The bot recorded ${t.increases.toLocaleString('en-US')} shelf-price increases and ${t.decreases.toLocaleString('en-US')} decreases across sampled stores, and ${t.shrinks} package-size reductions.`,
  ].join(' ');

  const tiles = [
    ['Prices collected', t.observations.toLocaleString('en-US'), `${m.days.length} days`],
    [
      'Items × retailers',
      `${t.items} × ${m.retailerIds.length}`,
      `${t.stores} sampled stores + online`,
    ],
    [
      'Average coverage',
      `${t.avgCoverage.toFixed(1)}%`,
      t.daysMissing ? `${t.daysMissing} day(s) without a run` : 'a run every day',
    ],
    ['Held for review', String(t.held), 'bad values and big jumps'],
    ...m.scorecard.map((r) => [
      `${retailer(r.retailer).name} basket`,
      money(r.basketCost),
      `${pct(r.basketPct)} in period`,
    ]),
    [
      'U.S. diesel',
      m.diesel ? money(m.diesel.to) : '—',
      m.diesel ? `${pct(m.diesel.pct)} in period` : 'not available',
    ],
  ]
    .map(
      ([k, v, n]) =>
        `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="n">${esc(n)}</div></div>`,
    )
    .join('');

  const basketTable = `<table class="small"><thead><tr><th>Day</th>${m.basketSeries.map((s) => `<th class="num">${esc(retailer(s.retailer).name)}</th>`).join('')}</tr></thead><tbody>${m.days
    .map(
      (day, i) =>
        `<tr><td>${dateLabel(day, { weekday: 'short', month: 'short', day: 'numeric' })}</td>${m.basketSeries.map((s) => `<td class="num">${money(s.cost[i]!)}</td>`).join('')}</tr>`,
    )
    .filter((_, i) => i % 7 === 0 || i === m.days.length - 1)
    .join('')}</tbody></table>`;

  const scorecard = `<table><thead><tr><th>Retailer</th><th class="num">Items carried</th><th class="num">Stores</th><th class="num">Basket, last day</th><th class="num">Basket change</th><th class="num">On promo, last day</th><th class="num">Out of stock</th></tr></thead><tbody>${m.scorecard
    .map(
      (r) =>
        `<tr><td>${esc(retailer(r.retailer).name)}</td><td class="num">${r.itemsCarried}</td><td class="num">${r.stores || 'online'}</td><td class="num">${money(r.basketCost)}</td><td class="num">${pct(r.basketPct)}</td><td class="num">${share(r.promoShare)}</td><td class="num">${share(r.outOfStock)}</td></tr>`,
    )
    .join('')}</tbody></table>`;

  const shrinks = m.shrinks.length
    ? `<table><thead><tr><th>Item</th><th>Retailer</th><th>First seen</th><th>Size</th><th class="num">Shelf price</th><th>Regions</th></tr></thead><tbody>${m.shrinks
        .map((e) => {
          const item = m.priceTable.find((p) => p.item.id === e.item_id)?.item;
          return `<tr><td>${esc(item?.name ?? e.item_id)}</td><td>${esc(retailer(e.retailer_id)?.name ?? e.retailer_id)}</td><td>${dateLabel(e.day)}</td><td class="nowrap">${esc((e.tag ?? '').replace(/_/g, ' '))}</td><td class="num">${money(Number(e.to_price))}</td><td>${esc([...new Set(e.regions)].map((r) => (r === 'nat' ? 'Online' : (PADD_NAMES[r] ?? r))).join(', '))}</td></tr>`;
        })
        .join(
          '',
        )}</tbody></table><p class="small muted">The same product, same shelf price, smaller package: the unit price rises without a price change on the shelf tag.</p>`
    : '<p class="muted">No package-size changes in this period.</p>';

  const runs = `<table class="small"><thead><tr><th>Day</th><th>Run</th><th class="num">Coverage</th><th class="num">Prices published</th><th class="num">Held</th><th class="num">Failed fetches</th></tr></thead><tbody>${m.runRows
    .map(
      (r) =>
        `<tr><td>${dateLabel(r.day, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>${esc(r.status)}</td><td class="num">${r.coverage === null ? '—' : `${r.coverage.toFixed(1)}%`}</td><td class="num">${r.published.toLocaleString('en-US')}</td><td class="num">${r.held}</td><td class="num">${r.failedTasks}/${r.tasks}</td></tr>`,
    )
    .join('')}</tbody></table>`;

  const reasons: Record<string, string> = {
    out_of_band: 'Outside the expected price range (for example a misplaced decimal)',
    price_jump: 'Moved more than 40% from the previous price',
    low_confidence: 'Uncertain product match',
    size_change: 'Size change',
  };
  const review = m.reviewReasons.length
    ? `<table class="small"><thead><tr><th>Reason</th><th class="num">Held</th></tr></thead><tbody>${m.reviewReasons.map(([r, n]) => `<tr><td>${esc(reasons[r] ?? r)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nothing was held for review.</p>';

  const appendix = `<table class="small"><thead><tr><th>Item</th><th>Size</th><th>Category</th>${m.retailerIds.map((r) => `<th class="num">${esc(retailer(r).name)}</th>`).join('')}<th class="num">Avg change</th></tr></thead><tbody>${m.priceTable
    .map((row) => {
      const changes = row.cells.map((c) => c.pct).filter((p): p is number => p !== null);
      const avg = changes.length ? changes.reduce((s, p) => s + p, 0) / changes.length : null;
      return `<tr><td>${esc(row.item.name)}</td><td>${esc(sizeLabel(row.item))}</td><td>${esc(row.item.category)}</td>${row.cells
        .map(
          (c) =>
            `<td class="num${row.cheapest.includes(c.retailer) ? ' best' : ''}">${money(c.price)}</td>`,
        )
        .join('')}<td class="num">${pct(avg)}</td></tr>`;
    })
    .join('')}</tbody></table>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DieselDelta Price Report</title>
<style>${STYLES}</style></head>
<body><main>
<h1>DieselDelta Price Report</h1>
<div class="sub">${esc(range)} · ${m.days.length} days · Generated ${esc(new Date(m.generatedAt).toUTCString().replace(' GMT', ' UTC'))}</div>
${m.simulated ? `<div class="banner"><b>Simulated data.</b> Every price in this report comes from the mock Kroger, Walmart and Amazon retailers used to develop the price bot (sources: ${esc(m.sources.join(', '))}). They are generated, not real shelf prices, and must not be quoted or published.</div>` : `<div class="sub">Sources: ${esc(m.sources.join(', '))}</div>`}
<p class="lede">${esc(lede)}</p>
<div class="tiles">${tiles}</div>

<h2>Basket over time</h2>
<p>The cost of the same ${m.basketItems.length} default-basket items at each retailer, indexed to 100 on the first day. Each item's price is the median across that retailer's sampled stores (Amazon is online). Items: ${esc(m.basketItems.map((i) => i.name).join(', '))}.</p>
<div class="figure">${basketChart(m)}</div>
<h3>Basket cost, weekly</h3>
${basketTable}

<h2>Retailers</h2>
${scorecard}
<h3>Basket cost by region, ${esc(dateLabel(m.to))}</h3>
<p class="small muted">Median across the two sampled stores in each region. Amazon has one online price nationwide, so it isn't shown here.</p>
<div class="figure">${regionChart(m)}</div>

<h2>Categories</h2>
<p>Average change from the first to the last day across every item and retailer in the category.</p>
<div class="figure">${categoryChart(m)}</div>
<table class="small"><thead><tr><th>Category</th><th class="num">Avg change</th><th class="num">Item × retailer pairs</th></tr></thead><tbody>${m.categories.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${pct(c.pct, 2)}</td><td class="num">${c.n}</td></tr>`).join('')}</tbody></table>

<h2>Biggest movers</h2>
<p class="small muted">National price (median across stores), first to last day. Moves under $0.03 or 0.5% are ignored.</p>
<h3>Largest increases</h3>
${changeTable(m.topUp, 'No increases in this period.')}
<h3>Largest decreases</h3>
${changeTable(m.topDown, 'No decreases in this period.')}

<h2>Shrinkflation</h2>
${shrinks}

<h2>Data quality</h2>
<div class="cols"><div>
<h3>Held for review</h3>
${review}
<p class="small muted">Held prices are not published until a person approves them.</p>
</div><div>
<h3>How prices are collected</h3>
<p class="small">The bot prices each item daily at about 10 sampled stores per store-priced retailer (2 per PADD region) and online for Amazon. It matches each retailer product to the catalog by brand, size and name; it identifies itself, follows robots.txt and rate limits, and stops a source that blocks it. Shelf prices and promotional prices are kept separately; this report uses shelf prices.</p>
</div></div>
<h3>Daily runs</h3>
${runs}

<h2 class="pb">Appendix: all ${m.priceTable.length} items, ${esc(dateLabel(m.to))}</h2>
<p class="small muted">National shelf price (median across sampled stores) on the last day each item was priced; the cheapest retailer (or retailers, when tied) is in bold. "—" means the retailer doesn't carry it. Avg change is the mean change over the period across retailers.</p>
${appendix}

<footer>DieselDelta price bot · ${esc(m.sources.join(', '))} · ${esc(m.from)} to ${esc(m.to)}${m.simulated ? ' · SIMULATED DATA' : ''}</footer>
</main></body></html>`;
}

// ---------- loading and output ----------

export async function loadReportData(
  db: BotDb,
  items: CanonicalItem[],
  from: string,
  to: string,
): Promise<ReportData> {
  const next = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [observations, stores, events, reviews, runs, sources] = await Promise.all([
    db.observations(
      from,
      next,
      'item_id,retailer_id,store_id,source_id,day,regular_price,promo_price,in_stock',
    ),
    db.stores(),
    db.events(from, next),
    db.reviews(from, next),
    db.runs(JOB),
    db.sources(),
  ]);
  let diesel: ReportData['diesel'] = [];
  const { data } = await db.client.rpc('fuel_series_daily', {
    p_area: 'NUS',
    p_kind: 'diesel',
    p_days: 400,
  });
  if (Array.isArray(data)) {
    diesel = (data as { day: string; price_usd_per_gal: number | string }[]).map((r) => ({
      day: r.day,
      price: Number(r.price_usd_per_gal),
    }));
  }
  return {
    from,
    to,
    items,
    observations,
    stores,
    events,
    reviews,
    runs,
    sources,
    diesel,
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
