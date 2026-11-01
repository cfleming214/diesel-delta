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
