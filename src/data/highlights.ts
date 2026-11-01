import type { ProductSummary } from './types';

export type HighlightKind = 'rising' | 'falling' | 'stable';
export type Highlight = { kind: HighlightKind; product: ProductSummary };

/** Moves under this (in %, over 30 days) count as stable. */
export const STABLE_BAND = 0.5;
/** Products kept in each pool. */
export const POOL_SIZE = 12;
/** Rows per kind on screen: 3 rising, 3 falling and 3 stable. */
export const PER_KIND = 3;

const abs = (v: number | null) => Math.abs(v ?? 0);

/**
 * The nationwide pools Today rotates through: the biggest 30-day risers and fallers, and the
 * steadiest products (flat over 30 days, then smallest 90-day and 1-year moves).
 */
export function highlightPools(products: readonly ProductSummary[]) {
  const d30 = (p: ProductSummary) => p.change.d30 ?? 0;
  return {
    rising: products
      .filter((p) => d30(p) > STABLE_BAND)
      .sort((a, b) => d30(b) - d30(a))
      .slice(0, POOL_SIZE),
    falling: products
      .filter((p) => d30(p) < -STABLE_BAND)
      .sort((a, b) => d30(a) - d30(b))
      .slice(0, POOL_SIZE),
    stable: products
      .filter((p) => abs(p.change.d30) <= STABLE_BAND && p.change.d90 != null)
      .sort(
        (a, b) => abs(a.change.d90) - abs(b.change.d90) || abs(a.change.d365) - abs(b.change.d365),
      )
      .slice(0, POOL_SIZE),
  };
}

export type HighlightPools = ReturnType<typeof highlightPools>;

/** How many pages before the rotation repeats. */
export const pageCount = (pools: HighlightPools) =>
  Math.max(1, ...Object.values(pools).map((p) => Math.ceil(p.length / PER_KIND)));

/**
 * The rows for one page: up to PER_KIND of each kind, taken in turn from each pool (wrapping a
 * short pool), interleaved rising, falling, stable.
 */
export function highlightPage(pools: HighlightPools, page: number): Highlight[] {
  const pick = (kind: HighlightKind) => {
    const pool = pools[kind];
    if (!pool.length) return [];
    const n = Math.min(PER_KIND, pool.length);
    return Array.from({ length: n }, (_, i) => ({
      kind,
      product: pool[(page * PER_KIND + i) % pool.length]!,
    }));
  };
  const lists = [pick('rising'), pick('falling'), pick('stable')];
  const out: Highlight[] = [];
  for (let i = 0; i < PER_KIND; i++) {
    for (const l of lists) {
      const h = l[i];
      if (h) out.push(h);
    }
  }
  return out;
}
