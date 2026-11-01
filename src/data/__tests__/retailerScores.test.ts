import { describe, expect, test } from '@jest/globals';

import { productSummaries } from '@/data/products';
import { gradeFor, retailerScores } from '@/data/retailerScores';

describe('retailer scorecard', () => {
  test('grade bands', () => {
    expect([100, 95, 90, 85, 84, 80].map(gradeFor)).toEqual(['A+', 'A+', 'A', 'A', 'A−', 'A−']);
    expect([79, 75, 74, 70, 69, 65].map(gradeFor)).toEqual(['B+', 'B+', 'B', 'B', 'B−', 'B−']);
    expect([64, 50, 49, 38, 35, 34, 0].map(gradeFor)).toEqual([
      'C+',
      'C−',
      'D+',
      'D−',
      'D−',
      'F',
      'F',
    ]);
  });

  test('every tracked retailer, its item count and its rollback share come from the catalog', () => {
    const scores = retailerScores();
    expect(scores.map((s) => s.name).sort()).toEqual(['Amazon', 'Kroger', 'Walmart']);
    for (const s of scores) {
      // Each retailer carries most, but not all, of the 150 products.
      expect(s.itemsTracked).toBeGreaterThan(140);
      expect(s.itemsTracked).toBeLessThanOrEqual(productSummaries().length);
      expect(s.grade).toBe(gradeFor(s.rollbackPct));
      for (const c of s.categories) expect(c.pct).toBeGreaterThanOrEqual(0);
    }
    const total = scores.reduce((n, s) => n + s.itemsTracked, 0);
    const carried = productSummaries().reduce((n, p) => n + p.retailerCount, 0);
    expect(total).toBe(carried);
  });
});
