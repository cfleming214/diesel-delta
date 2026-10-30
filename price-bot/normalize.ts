// Turns a retailer offer into an observation, then checks it before it is published.
import type { CanonicalItem } from './catalog';
import { parseSize, type Size, toBase } from './units';

/** What an adapter extracts from a response, before matching. */
export type RawOffer = {
  sku: string;
  gtin: string | null;
  title: string;
  brand: string | null;
  size: string | null;
  regular: number;
  promo: number | null;
  member: number | null;
  inStock: boolean | null;
};

export type Normalized = {
  regularPrice: number;
  promoPrice: number | null;
  memberPrice: number | null;
  size: Size;
  /** Regular price per base unit (g, ml, count, each or sq ft). */
  unitPrice: number;
  inStock: boolean | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** Null when the offer can't be compared: no usable price or size. */
export function normalize(item: CanonicalItem, offer: RawOffer): Normalized | null {
  if (!(offer.regular > 0)) return null;
  const size =
    item.pricedBy === 'package'
      ? parseSize(offer.size ?? '')
      : item.pricedBy === 'lb'
        ? { qty: 1, unit: 'lb' as const }
        : { qty: 1, unit: 'each' as const };
  if (!size) return null;
  const base = toBase(size);
  if (base.dimension !== toBase(item.size).dimension) return null;
  // Promo tracks separately; one at or above the regular price isn't a promo.
  const promo = offer.promo && offer.promo > 0 && offer.promo < offer.regular ? offer.promo : null;
  return {
    regularPrice: cents(offer.regular),
    promoPrice: promo === null ? null : cents(promo),
    memberPrice: offer.member && offer.member > 0 ? cents(offer.member) : null,
    size,
    unitPrice: offer.regular / base.qty,
    inStock: offer.inStock,
  };
}

export type Previous = { regularPrice: number; size: Size };

export type Verdict =
  | { kind: 'publish'; sizeChange: { from: Size; to: Size } | null }
  | { kind: 'hold'; reason: 'out_of_band' | 'price_jump'; detail: Record<string, unknown> };

/** Week-over-week (or day-over-day) regular-price moves above this are held for review. */
export const MAX_JUMP = 0.4;
/** Unit price must sit within this factor of the catalog reference (until trailing medians exist). */
export const BAND = { low: 0.35, high: 2.75 };

export function validate(item: CanonicalItem, n: Normalized, prev: Previous | null): Verdict {
  const refUnit = item.refPrice / toBase(item.size).qty;
  const ratio = n.unitPrice / refUnit;
  if (ratio < BAND.low || ratio > BAND.high) {
    return {
      kind: 'hold',
      reason: 'out_of_band',
      detail: {
        unitPrice: n.unitPrice,
        refUnitPrice: refUnit,
        ratio: Math.round(ratio * 100) / 100,
      },
    };
  }
  if (prev) {
    const move = n.regularPrice / prev.regularPrice - 1;
    if (Math.abs(move) > MAX_JUMP) {
      return {
        kind: 'hold',
        reason: 'price_jump',
        detail: {
          from: prev.regularPrice,
          to: n.regularPrice,
          move: Math.round(move * 1000) / 1000,
        },
      };
    }
  }
  const sizeChange =
    prev && (prev.size.qty !== n.size.qty || prev.size.unit !== n.size.unit)
      ? { from: prev.size, to: n.size }
      : null;
  return { kind: 'publish', sizeChange };
}
