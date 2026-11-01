import type { ProductSummary } from './types';

/** Word-AND match over name, size, category and the cheapest retailer. */
export function filterProducts(products: ProductSummary[], query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return products;
  return products.filter((p) => {
    const hay = `${p.name} ${p.size} ${p.category} ${p.retailer}`.toLowerCase();
    const compact = hay.replace(/\s/g, '');
    return words.every((w) => hay.includes(w) || compact.includes(w));
  });
}

/** Search results load this many at a time. */
export const SEARCH_PAGE_SIZE = 20;

export type SearchSuggestion = {
  /** What fills the search box when picked. */
  text: string;
  kind: 'product' | 'category';
  /** Products the suggestion would match. */
  count: number;
};

/**
 * Auto-fill suggestions for a partial query: product names, then categories. Names starting with
 * the query rank first, then names with a word starting with it, then names containing it; each
 * name appears once (sizes share a name), at most `limit` in all. Nothing for an empty query.
 */
export function searchSuggestions(
  products: readonly ProductSummary[],
  query: string,
  limit = 6,
): SearchSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (text: string) => {
    const t = text.toLowerCase();
    if (t === q) return -1;
    if (t.startsWith(q)) return 0;
    if (t.split(/[\s/-]+/).some((w) => w.startsWith(q))) return 1;
    return t.includes(q) ? 2 : null;
  };
  const tally = (key: (p: ProductSummary) => string, kind: SearchSuggestion['kind']) => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
    return [...counts]
      .map(([text, count]) => ({ text, kind, count, r: rank(text) }))
      .filter((s): s is typeof s & { r: number } => s.r !== null && s.r >= 0);
  };
  return [...tally((p) => p.name, 'product'), ...tally((p) => p.category, 'category')]
    .sort(
      (a, b) =>
        a.r - b.r ||
        (a.kind === b.kind ? 0 : a.kind === 'product' ? -1 : 1) ||
        a.text.localeCompare(b.text),
    )
    .slice(0, limit)
    .map(({ text, kind, count }) => ({ text, kind, count }));
}
