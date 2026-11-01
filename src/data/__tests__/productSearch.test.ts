import { describe, expect, test } from '@jest/globals';

import { filterProducts, SEARCH_PAGE_SIZE, searchSuggestions } from '../productSearch';
import { productSummaries } from '../products';

const products = productSummaries();

describe('search suggestions', () => {
  test('names starting with the text come first, then names with a word starting with it', () => {
    expect(searchSuggestions(products, 'mi').map((s) => s.text)).toEqual([
      'Microwave popcorn',
      '2% milk',
      'Frozen mixed berries',
      'Frozen mixed vegetables',
      'Oat milk',
      'Pancake mix',
    ]);
  });

  test('a name shared by several sizes appears once, with its count', () => {
    const [first] = searchSuggestions(products, 'heinz');
    expect(first).toEqual({ text: 'Heinz ketchup', kind: 'product', count: 2 });
  });

  test('categories are suggested too', () => {
    expect(searchSuggestions(products, 'dair')).toContainEqual({
      text: 'Dairy',
      kind: 'category',
      count: products.filter((p) => p.category === 'Dairy').length,
    });
  });

  test('nothing for an empty query, an exact name, or no match; at most the limit', () => {
    expect(searchSuggestions(products, '  ')).toEqual([]);
    expect(searchSuggestions(products, 'Whole milk')).toEqual([]);
    expect(searchSuggestions(products, 'zzzz')).toEqual([]);
    expect(searchSuggestions(products, 'e')).toHaveLength(6);
    expect(searchSuggestions(products, 'e', 3)).toHaveLength(3);
  });

  test('every suggestion finds products when searched', () => {
    for (const q of ['ke', 'froz', 'pa', 'be']) {
      for (const s of searchSuggestions(products, q)) {
        expect(filterProducts(products, s.text).length).toBeGreaterThan(0);
      }
    }
  });

  test('pages hold 20 results', () => {
    expect(SEARCH_PAGE_SIZE).toBe(20);
  });
});
