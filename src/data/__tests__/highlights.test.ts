import { describe, expect, test } from '@jest/globals';

import { highlightPage, highlightPools, pageCount, POOL_SIZE } from '../highlights';
import { productSummaries } from '../products';
import type { ProductSummary } from '../types';

const product = (id: string, d30: number, d90 = d30, d365 = d90): ProductSummary => ({
  id,
  name: id,
  size: '1 ct',
  category: 'Pantry',
  imageUrl: null,
  price: 1,
  retailer: 'Kroger',
  change: { d30, d90, d365 },
  retailerCount: 3,
});

describe('highlights', () => {
  test('pools: biggest risers, biggest fallers, steadiest products', () => {
    const pools = highlightPools([
      product('up1', 3),
      product('up2', 9),
      product('down1', -4),
      product('flat1', 0.2, 5),
      product('flat2', 0, 0.1),
      product('edge', 0.5),
    ]);
    expect(pools.rising.map((p) => p.id)).toEqual(['up2', 'up1']);
    expect(pools.falling.map((p) => p.id)).toEqual(['down1']);
    expect(pools.stable.map((p) => p.id)).toEqual(['flat2', 'edge', 'flat1']);
  });

  test('a page interleaves 3 of each kind and the next page shows different products', () => {
    const pools = highlightPools(productSummaries());
    expect(pools.rising.length).toBe(POOL_SIZE);
    expect(pools.falling.length).toBe(POOL_SIZE);
    expect(pageCount(pools)).toBe(4);
    const first = highlightPage(pools, 0);
    expect(first.map((h) => h.kind)).toEqual([
      'rising',
      'falling',
      'stable',
      'rising',
      'falling',
      'stable',
      'rising',
      'falling',
      'stable',
    ]);
    const second = highlightPage(pools, 1);
    const ids = (page: typeof first) => new Set(page.map((h) => h.product.id));
    expect([...ids(second)].filter((id) => ids(first).has(id))).toEqual([]);
    // The rotation repeats after the last page.
    expect(highlightPage(pools, 4)).toEqual(first);
    // Risers really rose and fallers fell.
    for (const h of first) {
      if (h.kind === 'rising') expect(h.product.change.d30!).toBeGreaterThan(0.5);
      if (h.kind === 'falling') expect(h.product.change.d30!).toBeLessThan(-0.5);
    }
  });

  test('a short pool wraps and an empty one is skipped', () => {
    const pools = highlightPools([product('up', 2), product('a', 0), product('b', 0)]);
    expect(highlightPage(pools, 0).map((h) => h.product.id)).toEqual(['up', 'a', 'b']);
    expect(highlightPage(pools, 1).map((h) => h.product.id)).toEqual(['up', 'b', 'a']);
  });
});
