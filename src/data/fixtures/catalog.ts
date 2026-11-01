import type { Verdict } from '@/domain';

import type { CatalogItem, CategoryPassThrough, Store } from '../types';

type Row = [
  id: string,
  name: string,
  size: string,
  category: string,
  store: Store,
  price: number,
  verdict: Verdict,
  inDefaultBasket: 0 | 1,
];

const ROWS: Row[] = [
  ['milk', 'Whole milk', '1 gal', 'Dairy', 'Kroger', 3.89, 'gouge', 1],
  ['eggs', 'Large eggs', '12 ct', 'Dairy', 'Walmart', 3.24, 'track', 1],
  ['bread', 'White bread', '20 oz', 'Bakery', 'Kroger', 2.79, 'sticky', 1],
  ['chicken', 'Boneless chicken breast', 'per lb', 'Meat', 'Walmart', 4.29, 'gouge', 1],
  ['rice', 'Long-grain rice', '5 lb', 'Dry goods', 'Target', 4.99, 'sticky', 1],
  ['bananas', 'Bananas', 'per lb', 'Produce', 'Walmart', 0.62, 'track', 1],
  ['ketchup', 'Heinz ketchup', '32 oz', 'Pantry', 'Target', 4.79, 'gouge', 1],
  ['beef', 'Ground beef 80/20', 'per lb', 'Meat', 'Kroger', 5.99, 'sticky', 1],
  ['peas', 'Frozen peas', '12 oz', 'Frozen', 'Albertsons', 1.89, 'gouge', 1],
  ['potatoes', 'Russet potatoes', '5 lb', 'Produce', 'Kroger', 4.49, 'track', 1],
  ['cheddar', 'Cheddar cheese', '8 oz', 'Dairy', 'Target', 2.99, 'sticky', 1],
  ['towels', 'Paper towels', '6 roll', 'Household', 'Amazon', 11.99, 'gouge', 1],
  ['pb', 'Peanut butter', '16 oz', 'Pantry', 'Walmart', 2.48, 'track', 1],
  ['oj', 'Orange juice', '52 oz', 'Beverages', 'Albertsons', 4.99, 'sticky', 1],
  ['soap', 'Dish soap', '19 oz', 'Household', 'Target', 3.69, 'track', 1],
  ['pasta', 'Spaghetti', '16 oz', 'Dry goods', 'Kroger', 1.49, 'sticky', 1],
  ['ketchup20', 'Heinz ketchup', '20 oz', 'Pantry', 'Walmart', 3.12, 'sticky', 0],
  ['yogurt', 'Greek yogurt', '32 oz', 'Dairy', 'Kroger', 5.49, 'gouge', 0],
  ['coffee', 'Ground coffee', '12 oz', 'Pantry', 'Costco', 8.99, 'track', 0],
  ['butter', 'Salted butter', '16 oz', 'Dairy', 'Walmart', 4.68, 'sticky', 0],
  ['apples', 'Gala apples', '3 lb', 'Produce', 'Kroger', 4.99, 'track', 0],
  ['pizza', 'Frozen pizza', 'pepperoni', 'Frozen', 'Target', 5.29, 'gouge', 0],
];

export const CATALOG: CatalogItem[] = ROWS.map(
  ([id, name, size, category, store, price, verdict]) => ({
    id,
    name,
    size,
    category,
    store,
    price,
    verdict,
  }),
);

export const DEFAULT_BASKET_IDS: string[] = ROWS.filter((r) => r[7]).map((r) => r[0]);
export const DEFAULT_FOLLOWED_IDS = ['milk', 'chicken', 'ketchup'];

export const CATEGORY_PASS_THROUGH: CategoryPassThrough[] = [
  { category: 'Produce', pct: 71 },
  { category: 'Bakery', pct: 33 },
  { category: 'Meat', pct: 24 },
  { category: 'Dairy', pct: 18 },
  { category: 'Dry goods', pct: 12 },
  { category: 'Frozen', pct: 9 },
  { category: 'Household', pct: 6 },
];

export const STORES: Store[] = ['Kroger', 'Walmart', 'Target', 'Costco', 'Albertsons', 'Amazon'];
