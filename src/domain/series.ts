/** Both series indexed to 100 at the window start; the fuel series optionally shifted forward. */
export function indexWindow(
  fuel: readonly number[],
  basket: readonly number[],
  start: number,
  end: number,
  lagDays = 0,
): { fuel: number[]; basket: number[] } {
  const f = (i: number) => fuel[Math.max(0, i - lagDays)]!;
  const f0 = f(start);
  const b0 = basket[start]!;
  const fi: number[] = [];
  const bi: number[] = [];
  for (let i = start; i <= end; i++) {
    fi.push((f(i) / f0) * 100);
    bi.push((basket[i]! / b0) * 100);
  }
  return { fuel: fi, basket: bi };
}

/** Value range across series, padded by 12% of the span plus 0.5 on each side. */
export function paddedRange(...series: readonly (readonly number[])[]) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series)
    for (const v of s) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  const pad = (hi - lo) * 0.12 + 0.5;
  return { lo: lo - pad, hi: hi + pad };
}

/** Gridline values inside [lo, hi], stepping 1, 2 or 5 depending on the span. */
export function gridValues(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span > 12 ? 5 : span > 5 ? 2 : 1;
  const out: number[] = [];
  for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) out.push(g);
  return out;
}

/** Index of the point nearest a horizontal fraction (0..1) across `count` points. */
export const nearestIndex = (fraction: number, count: number) =>
  Math.round(Math.min(1, Math.max(0, fraction)) * (count - 1));

/** Maps a value in [d0, d1] onto [r0, r1]. */
export const scaleLinear =
  (d0: number, d1: number, r0: number, r1: number) =>
  (v: number): number =>
    d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** SVG path for a sparkline that fills W×H with a 2pt vertical inset. */
export function sparkPath(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - 2 - ((v - lo) / range) * (height - 4);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
}
