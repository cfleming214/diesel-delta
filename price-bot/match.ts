// Matches retailer products to catalog items. GTIN and an approved crosswalk come first (stored in
// item_identifiers); this spec matcher handles discovery: brand, size within tolerance, and the
// item's name words, with qualifier words (organic, value pack, ...) counting against a match.
// P3 hardens it against an eval set of real listings.
import type { CanonicalItem } from './catalog';
import { parseSize, sizeRatio } from './units';

export type ProductListing = {
  sku: string;
  gtin?: string | null;
  title: string;
  brand?: string | null;
  size?: string | null;
};

export type Match = { itemId: string; confidence: number };

/** Confidence at or above which a match is approved without review. */
export const AUTO_APPROVE = 0.9;
/** Below this, the candidate is dropped. Between the two, it waits for review. */
export const REVIEW_FLOOR = 0.6;

/** Words that make a different product: a match that has one the item lacks is penalised. */
const QUALIFIERS = [
  'organic',
  'value',
  'pack',
  'family',
  'bulk',
  'lite',
  'light',
  'reduced',
  'sugar-free',
  'unsweetened',
  'flavored',
  'mini',
  'jumbo',
  'decaf',
];

const STOP = new Set(['and', 'the', 'of', 'with', 'a']);

export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9%/-]+/)
    .filter((w) => w && !STOP.has(w));

/** Plural-insensitive word match ("tortillas" = "tortilla", "potatoes" = "potato"). */
const stem = (w: string) => w.replace(/(es|s)$/, '');

export function scoreMatch(item: CanonicalItem, p: ProductListing): number {
  const title = words(p.title);
  const titleStems = new Set(title.map(stem));
  // Ratio and percent tokens tell variants apart ("80/20", "2%"); other numbers are sizes.
  const nameWords = words(item.name).filter((w) => !/^\d/.test(w) || /[/%]/.test(w));
  if (nameWords.length === 0) return 0;
  const covered = nameWords.filter((w) => titleStems.has(stem(w))).length / nameWords.length;
  if (covered < 0.75) return 0;

  if (item.brandPolicy === 'national') {
    const brand = (p.brand ?? '').toLowerCase();
    if (!brand || !item.brand || brand !== item.brand.toLowerCase()) return 0;
  }

  let sizeScore = 1;
  if (item.pricedBy === 'package') {
    const size = parseSize(p.size ?? '') ?? parseSize(p.title.split(',').pop() ?? '');
    const ratio = size ? sizeRatio(size, item.size) : null;
    if (ratio === null) return 0;
    const off = Math.abs(ratio - 1);
    if (off > Math.max(item.sizeTolerance, 0.02) * 2) return 0;
    sizeScore = off <= Math.max(item.sizeTolerance, 0.001) ? 1 : 0.7;
  }

  // Brand words don't count as qualifiers ("Great Value" is a brand, not a value pack).
  const exempt = new Set([...words(item.name), ...words(p.brand ?? '')]);
  const extraQualifiers = title.filter((w) => QUALIFIERS.includes(w) && !exempt.has(w)).length;
  const qualifierScore = extraQualifiers ? 0.55 : 1;

  return Math.round(covered * sizeScore * qualifierScore * 1000) / 1000;
}

/** Best catalog item for a product, or null when nothing reaches the review floor. */
export function bestMatch(items: CanonicalItem[], p: ProductListing): Match | null {
  let best: Match | null = null;
  for (const item of items) {
    const confidence = scoreMatch(item, p);
    if (confidence < REVIEW_FLOOR) continue;
    // Ties go to the item whose name is the longer exact phrase ("Whole milk" over "Milk").
    if (
      !best ||
      confidence > best.confidence ||
      (confidence === best.confidence &&
        item.name.length > items.find((i) => i.id === best!.itemId)!.name.length)
    ) {
      best = { itemId: item.id, confidence };
    }
  }
  return best;
}

/**
 * Matches a whole retailer catalog. Each item keeps at most one approved product: when two
 * products reach auto-approve for one item, the closer title wins and the other goes to review.
 */
export function matchCatalog(items: CanonicalItem[], products: ProductListing[]) {
  const results = products
    .map((p) => ({ product: p, match: bestMatch(items, p) }))
    .filter((r): r is { product: ProductListing; match: Match } => r.match !== null);
  const approvedFor = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    if (r.match.confidence < AUTO_APPROVE) continue;
    const prev = approvedFor.get(r.match.itemId);
    if (!prev || r.product.title.length < prev.product.title.length)
      approvedFor.set(r.match.itemId, r);
  }
  return results.map((r) => ({
    ...r,
    status: approvedFor.get(r.match.itemId) === r ? ('approved' as const) : ('pending' as const),
  }));
}
