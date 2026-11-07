import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { CATALOG, DEFAULT_BASKET_IDS } from '@/data/fixtures/catalog';
import { PRODUCT_SEEDS } from '@/data/fixtures/products.gen';

import {
  BENCHMARK_CATEGORIES,
  loadBlsProductMeta,
  parseBlsProductMeta,
  CATEGORIES,
  isShelfItem,
  loadCatalog,
  parseCatalog,
  sizeLabel,
} from './catalog';
import { parseSize, sizeRatio, toBase } from './units';

const HEADER =
  'id,name,category,size_qty,size_unit,priced_by,size_tolerance,brand_policy,brand,ref_price,bls_series_id,in_default_basket';

describe('catalog', () => {
  const items = loadCatalog();

  test('has 168 unique shelf items across the 11 grocery categories', () => {
    assert.equal(items.length, 168);
    assert.equal(new Set(items.map((i) => i.id)).size, 168);
    assert.deepEqual(
      new Set(items.map((i) => i.category)),
      new Set(CATEGORIES.filter((c) => !BENCHMARK_CATEGORIES.includes(c))),
    );
  });

  test('fuels are BLS benchmarks only: mapped, outside the basket and the shelf list', () => {
    const all = loadCatalog({ benchmarks: true });
    const fuels = all.filter((i) => !isShelfItem(i));
    assert.equal(all.length, 176);
    assert.equal(new Set(all.map((i) => i.id)).size, 176);
    assert.deepEqual(new Set(fuels.map((i) => i.category)), new Set(['Fuel']));
    assert.equal(fuels.length, 8);
    for (const f of fuels) {
      assert.ok(f.blsSeriesId, `${f.id} needs a BLS series`);
      assert.equal(f.inDefaultBasket, false, f.id);
    }
    assert.ok(PRODUCT_SEEDS.every((p) => !fuels.some((f) => f.id === p[0])));
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

  test("the app's product list matches the catalog (regenerate with npm run products:gen)", () => {
    assert.deepEqual(
      PRODUCT_SEEDS,
      items.map((i) => [
        i.id,
        i.name,
        sizeLabel(i),
        i.category,
        i.refPrice,
        i.inDefaultBasket ? 1 : 0,
      ]),
    );
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

describe('BLS product names', () => {
  test('every catalog BLS mapping has a curated name and category', () => {
    const meta = loadBlsProductMeta();
    assert.equal(meta.size, 60);
    for (const i of loadCatalog({ benchmarks: true })) {
      if (!i.blsSeriesId) continue;
      const m = meta.get(i.blsSeriesId.slice(7));
      assert.ok(m, `${i.id}: ${i.blsSeriesId} has no row in bls_products.csv`);
      // Fuel items sit under Fuel products; grocery items under grocery products.
      assert.equal(m.category === 'Fuel', i.category === 'Fuel', i.id);
    }
  });

  test('reports every bad row', () => {
    const csv = [
      'item_code,display_name,category,unit_label',
      '709112,Whole milk,Dairy,',
      '709112,Milk again,Dairy,',
      'x,,Snacks,',
      '74714,Gas,Petrol,',
    ].join('\n');
    assert.throws(
      () => parseBlsProductMeta(csv),
      (e: Error) =>
        /duplicate item_code "709112"/.test(e.message) &&
        /bad item_code "x"/.test(e.message) &&
        /display_name is required/.test(e.message) &&
        /unknown category "Petrol"/.test(e.message),
    );
  });
});
