import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { CATALOG, DEFAULT_BASKET_IDS } from '@/data/fixtures/catalog';

import { CATEGORIES, loadCatalog, parseCatalog, sizeLabel } from './catalog';
import { parseSize, sizeRatio, toBase } from './units';

const HEADER =
  'id,name,category,size_qty,size_unit,priced_by,size_tolerance,brand_policy,brand,ref_price,bls_series_id,in_default_basket';

describe('catalog', () => {
  const items = loadCatalog();

  test('has 150 unique items across the 11 categories', () => {
    assert.equal(items.length, 150);
    assert.equal(new Set(items.map((i) => i.id)).size, 150);
    assert.deepEqual(new Set(items.map((i) => i.category)), new Set(CATEGORIES));
  });

  test('keeps every fixture item ID and the default basket, so saved baskets survive', () => {
    const ids = new Set(items.map((i) => i.id));
    for (const f of CATALOG) assert.ok(ids.has(f.id), `missing fixture item ${f.id}`);
    assert.deepEqual(
      items
        .filter((i) => i.inDefaultBasket)
        .map((i) => i.id)
        .sort(),
      [...DEFAULT_BASKET_IDS].sort(),
    );
  });

  test('fixture items keep their size', () => {
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const f of CATALOG) {
      const item = byId.get(f.id)!;
      const fixture = parseSize(f.size);
      // The fixture's pizza "size" is its variety ("pepperoni"), not a size.
      if (!fixture) {
        assert.equal(f.id, 'pizza');
        continue;
      }
      assert.equal(item.size.qty, fixture.qty, `${f.id} quantity`);
      // The fixtures write liquid sizes as "oz"; the catalog says fl oz.
      const unit = item.size.unit === 'fl_oz' ? 'oz' : item.size.unit;
      assert.equal(unit, fixture.unit, `${f.id} unit (${sizeLabel(item)} vs ${f.size})`);
    }
  });

  test('reports every invalid row at once', () => {
    const csv = [
      HEADER,
      'Milk,Whole milk,Dairy,1,gal,package,0.05,cheapest_comparable,,3.89,,1',
      'eggs,Eggs,Snacks,12,dozen,package,0,national,,3.24,,1',
      'eggs,Eggs,Dairy,2,lb,lb,0,cheapest_comparable,,3.24,XYZ,2',
    ].join('\n');
    assert.throws(
      () => parseCatalog(csv),
      (e: Error) =>
        [
          'row 2: bad id "Milk"',
          'row 3: unknown size_unit "dozen"',
          'row 3: national brand_policy needs a brand',
          'row 4: duplicate id "eggs"',
          'row 4: priced_by lb needs size 1 lb',
          'row 4: bad bls_series_id "XYZ"',
          'row 4: in_default_basket must be 0 or 1',
        ].every((m) => e.message.includes(m)),
    );
  });

  test('rejects a changed header', () => {
    assert.throws(() => parseCatalog('id,name\nmilk,Milk'), /header/);
  });
});

describe('sizes', () => {
  const cases: [string, ReturnType<typeof parseSize>][] = [
    ['32 oz', { qty: 32, unit: 'oz' }],
    ['32 OZ', { qty: 32, unit: 'oz' }],
    ['52 fl oz', { qty: 52, unit: 'fl_oz' }],
    ['52 Fl. Oz.', { qty: 52, unit: 'fl_oz' }],
    ['1 gal', { qty: 1, unit: 'gal' }],
    ['1 Gallon', { qty: 1, unit: 'gal' }],
    ['1.5 qt', { qty: 1.5, unit: 'qt' }],
    ['2 L', { qty: 2, unit: 'l' }],
    ['12 ct', { qty: 12, unit: 'ct' }],
    ['12 count', { qty: 12, unit: 'ct' }],
    ['6 rolls', { qty: 6, unit: 'roll' }],
    ['6 roll', { qty: 6, unit: 'roll' }],
    ['2/12 oz', { qty: 24, unit: 'oz' }],
    ['2 x 6 oz', { qty: 12, unit: 'oz' }],
    ['12 ct (2 x 6)', { qty: 12, unit: 'ct' }],
    ['5 lb bag', { qty: 5, unit: 'lb' }],
    ['per lb', { qty: 1, unit: 'lb' }],
    ['/lb', { qty: 1, unit: 'lb' }],
    ['each', { qty: 1, unit: 'each' }],
    ['75 sq ft', { qty: 75, unit: 'sq_ft' }],
    ['family size', null],
    ['', null],
  ];
  for (const [text, want] of cases) {
    test(`parses "${text}"`, () => assert.deepEqual(parseSize(text), want));
  }

  test('compares sizes in base units, and only within one dimension', () => {
    assert.ok(Math.abs(sizeRatio({ qty: 1, unit: 'lb' }, { qty: 16, unit: 'oz' })! - 1) < 1e-9);
    assert.ok(
      Math.abs(sizeRatio({ qty: 1, unit: 'gal' }, { qty: 128, unit: 'fl_oz' })! - 1) < 1e-9,
    );
    assert.equal(sizeRatio({ qty: 16, unit: 'oz' }, { qty: 16, unit: 'fl_oz' }), null);
    assert.equal(toBase({ qty: 2, unit: 'l' }).qty, 2000);
  });
});
