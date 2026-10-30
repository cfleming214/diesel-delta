import { describe, expect, test } from '@jest/globals';

import { compareToListed, listedPriceFor, parseReceipt } from '@/domain';
import { CATALOG } from '@/data/fixtures/catalog';
import { MOCK_RECEIPT_TEXT } from '@/lib/ocr';

describe('parseReceipt', () => {
  test('extracts store, date and item lines, skipping totals and payment', () => {
    expect(parseReceipt(MOCK_RECEIPT_TEXT)).toEqual({
      store: 'Kroger',
      date: '2026-10-28',
      lines: [
        { text: 'WHOLE MILK 1 GAL', price: 3.89 },
        { text: 'LARGE EGGS 12 CT', price: 3.19 },
        { text: 'BANANAS 2.1 LB', price: 1.32 },
        { text: 'FROZEN PEAS 12 OZ', price: 1.89 },
      ],
    });
  });

  test('handles $ signs, 4-digit years, unknown stores and junk', () => {
    const r = parseReceipt('CORNER MARKET\n3/7/2026\nBread $2.49\n***\n12.00\nTotal $2.49');
    expect(r).toEqual({ store: null, date: '2026-03-07', lines: [{ text: 'Bread', price: 2.49 }] });
    expect(parseReceipt('')).toEqual({ store: null, date: null, lines: [] });
  });
});

describe('listed prices', () => {
  test('matches by name and size; per-pound items by weight', () => {
    expect(listedPriceFor({ text: 'WHOLE MILK 1 GAL', price: 3.89 }, CATALOG)).toBe(3.89);
    expect(listedPriceFor({ text: 'HEINZ KETCHUP 20 OZ', price: 3.12 }, CATALOG)).toBe(3.12);
    expect(listedPriceFor({ text: 'BANANAS 2.1 LB', price: 1.32 }, CATALOG)).toBe(1.3);
    expect(listedPriceFor({ text: 'BANANAS', price: 1.32 }, CATALOG)).toBeNull();
    expect(listedPriceFor({ text: 'CAVIAR TIN', price: 99 }, CATALOG)).toBeNull();
  });

  test('comparison copy', () => {
    expect(compareToListed(3.89, 3.89)).toEqual({ text: 'Matches listed price', differs: false });
    expect(compareToListed(4.99, 4.79)).toEqual({ text: '$0.20 above listed', differs: true });
    expect(compareToListed(3.19, 3.24)).toEqual({ text: '$0.05 below listed', differs: true });
    expect(compareToListed(2, null)).toEqual({
      text: 'No listed price to compare',
      differs: false,
    });
  });
});
