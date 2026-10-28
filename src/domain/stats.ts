/** Pearson correlation coefficient. Returns 0 when either series has no variance. */
export function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  if (n !== b.length) throw new RangeError('Series must be the same length');
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

/**
 * Correlation between the basket and the fuel series shifted forward by `lagWeeks`, over
 * days `from`..end. Day i of the basket pairs with day i − 7·lag of fuel.
 */
export function correlationAtLag(
  fuel: readonly number[],
  basket: readonly number[],
  from: number,
  lagWeeks: number,
): number {
  const lagDays = lagWeeks * 7;
  if (from - lagDays < 0) throw new RangeError('Not enough fuel history for this lag');
  const a: number[] = [];
  const b: number[] = [];
  for (let i = from; i < basket.length; i++) {
    a.push(basket[i]!);
    b.push(fuel[i - lagDays]!);
  }
  return pearson(a, b);
}

/** Lag (0..maxWeeks) with the highest correlation; the earliest lag wins ties. */
export function bestLag(
  fuel: readonly number[],
  basket: readonly number[],
  from: number,
  maxWeeks = 12,
): { weeks: number; r: number } {
  let best = { weeks: 0, r: -Infinity };
  for (let w = 0; w <= maxWeeks; w++) {
    const r = correlationAtLag(fuel, basket, from, w);
    if (r > best.r) best = { weeks: w, r };
  }
  return best;
}
