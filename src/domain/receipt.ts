import { money } from './format';

export type ReceiptLine = { text: string; price: number };
export type ParsedReceipt = { store: string | null; date: string | null; lines: ReceiptLine[] };

const KNOWN_STORES = ['Kroger', 'Walmart', 'Target', 'Costco', 'Albertsons', 'Amazon'];
/** Totals, tax, payment and loyalty lines are not item prices. */
const NOT_ITEM =
  /\b(sub ?total|total|tax|change|cash|visa|mastercard|amex|debit|credit|balance|savings|you saved|coupon|discount|tender|points)\b/i;
/** Item text followed by a price, optionally a tax flag (e.g. "F" or "T") after it. */
const ITEM_LINE = /^(.*?[A-Za-z].*?)\s+\$?(\d{1,4}\.\d{2})(?:\s+[A-Z]{1,2})?$/;
const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/;

/** Pulls item lines, store and purchase date out of OCR'd receipt text. */
export function parseReceipt(text: string): ParsedReceipt {
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const store =
    KNOWN_STORES.find((s) =>
      rows.slice(0, 4).some((r) => r.toLowerCase().includes(s.toLowerCase())),
    ) ?? null;
  let date: string | null = null;
  for (const r of rows) {
    const m = DATE.exec(r);
    if (m) {
      const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      date = `${year}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
      break;
    }
  }
  const lines: ReceiptLine[] = [];
  for (const r of rows) {
    if (NOT_ITEM.test(r)) continue;
    const m = ITEM_LINE.exec(r);
    if (!m) continue;
    const price = Number(m[2]);
    if (price > 0) lines.push({ text: m[1]!.trim(), price });
  }
  return { store, date, lines };
}

/** How a paid price compares with the listed shelf price, as history copy. */
export function compareToListed(
  paid: number,
  listed: number | null,
): {
  text: string;
  differs: boolean;
} {
  if (listed == null) return { text: 'No listed price to compare', differs: false };
  const diff = Math.round((paid - listed) * 100) / 100;
  if (Math.abs(diff) < 0.005) return { text: 'Matches listed price', differs: false };
  return {
    text: `${money(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} listed`,
    differs: true,
  };
}

type Listed = { name: string; size: string; price: number };

/**
 * Listed shelf price for a receipt line, matched by catalog item name. Per-pound items compare the
 * unit price when the line carries a weight ("BANANAS 2.1 LB"). Null when nothing matches.
 */
export function listedPriceFor(line: ReceiptLine, catalog: readonly Listed[]): number | null {
  const text = line.text.toLowerCase();
  const candidates = catalog
    .filter((c) =>
      c.name
        .toLowerCase()
        .split(/\s+/)
        .every((w) => text.includes(w)),
    )
    .sort((a, b) => b.name.length - a.name.length);
  const sized =
    candidates.find((c) =>
      text.replace(/\s+/g, '').includes(c.size.toLowerCase().replace(/\s+/g, '')),
    ) ?? candidates[0];
  if (!sized) return null;
  if (sized.size === 'per lb') {
    const lb = /(\d+(?:\.\d+)?)\s*lb\b/.exec(text);
    // Without a weight, a per-pound line cannot be compared.
    return lb ? Math.round(sized.price * Number(lb[1]) * 100) / 100 : null;
  }
  return sized.price;
}
