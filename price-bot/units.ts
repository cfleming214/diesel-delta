// Package sizes: the catalog's units, conversion to base units, and parsing retailer size text.

export const UNITS = [
  'oz',
  'lb',
  'fl_oz',
  'gal',
  'qt',
  'l',
  'ml',
  'ct',
  'roll',
  'each',
  'sq_ft',
] as const;
export type Unit = (typeof UNITS)[number];

/** Base dimension a unit measures. Prices are only compared within one dimension. */
export type Dimension = 'mass_g' | 'volume_ml' | 'count' | 'each' | 'area_sq_ft';

const TO_BASE: Record<Unit, [Dimension, number]> = {
  oz: ['mass_g', 28.349523125],
  lb: ['mass_g', 453.59237],
  fl_oz: ['volume_ml', 29.5735295625],
  gal: ['volume_ml', 3785.411784],
  qt: ['volume_ml', 946.352946],
  l: ['volume_ml', 1000],
  ml: ['volume_ml', 1],
  ct: ['count', 1],
  roll: ['count', 1],
  each: ['each', 1],
  sq_ft: ['area_sq_ft', 1],
};

export type Size = { qty: number; unit: Unit };
export type BaseSize = { qty: number; dimension: Dimension };

export const isUnit = (u: string): u is Unit => (UNITS as readonly string[]).includes(u);

export function toBase({ qty, unit }: Size): BaseSize {
  const [dimension, factor] = TO_BASE[unit];
  return { qty: qty * factor, dimension };
}

/** a / b in base units, or null when the sizes measure different things. */
export function sizeRatio(a: Size, b: Size): number | null {
  const x = toBase(a);
  const y = toBase(b);
  return x.dimension === y.dimension && y.qty > 0 ? x.qty / y.qty : null;
}

const ALIASES: [RegExp, Unit][] = [
  [/^(fl\.?\s*oz|fluid\s*ounces?)$/, 'fl_oz'],
  [/^(oz|ounces?)$/, 'oz'],
  [/^(lbs?|pounds?)$/, 'lb'],
  [/^(gal|gallons?)$/, 'gal'],
  [/^(qts?|quarts?)$/, 'qt'],
  [/^(l|liters?|litres?)$/, 'l'],
  [/^(ml|milliliters?|millilitres?)$/, 'ml'],
  [/^rolls?$/, 'roll'],
  [/^(ct|count|pk|pack|bags?|pods?|bars?|cans?|bottles?|tortillas?|eggs?)$/, 'ct'],
  [/^(ea|each)$/, 'each'],
  [/^(sq\.?\s*ft|square\s*feet)$/, 'sq_ft'],
];

function unitOf(text: string): Unit | null {
  const t = text.trim().toLowerCase().replace(/\.$/, '');
  for (const [re, unit] of ALIASES) if (re.test(t)) return unit;
  return null;
}

/** The unit at the start of `rest`, trying the longest run of words first ("fl oz" before "fl"). */
function leadingUnit(rest: string): Unit | null {
  const words = rest.split(/[\s(]+/).filter(Boolean);
  for (let n = Math.min(3, words.length); n > 0; n--) {
    const unit = unitOf(words.slice(0, n).join(' '));
    if (unit) return unit;
  }
  return null;
}

/**
 * Parses retailer size text into one size. Handles "32 oz", "1 gal", "12 ct", "1.5 qt",
 * "2/12 oz" and "2 x 12 oz" (multipacks, multiplied out), "12 ct (2 x 6)" (first size wins),
 * "per lb" and "each". Returns null when no size is recognised.
 */
export function parseSize(text: string): Size | null {
  const t = text.toLowerCase().replace(/,/g, '').trim();
  if (/^(per\s+)?lb$|^\/\s*lb$|per pound/.test(t)) return { qty: 1, unit: 'lb' };
  if (/^(ea|each)$/.test(t)) return { qty: 1, unit: 'each' };

  const multi = t.match(/^(\d+)\s*(?:\/|x)\s*(\d*\.?\d+)\s*(.*)$/);
  if (multi) {
    const unit = leadingUnit(multi[3]!);
    if (unit) return { qty: Number(multi[1]) * Number(multi[2]), unit };
  }
  const single = t.match(/^(\d*\.?\d+)\s*(.*)$/);
  if (single) {
    const unit = leadingUnit(single[2]!);
    if (unit) return { qty: Number(single[1]), unit };
  }
  return null;
}
