// Static copy and sample data from the prototype.

/** Receipt OCR sample lines: [text, price]. */
export const OCR_SAMPLE: [string, number][] = [
  ['Whole milk 1 gal', 3.89],
  ['Large eggs 12 ct', 3.19],
  ['Bananas 2.1 lb', 1.32],
  ['Frozen peas 12 oz', 1.89],
];

export type ReceiptEntry = {
  item: string;
  price: number;
  store: string;
  date: string;
  /** Comparison against the listed price. */
  comparison: string;
  /** True when the paid price differs from the listed price. */
  differs: boolean;
};

export const SAMPLE_RECEIPT_HISTORY: ReceiptEntry[] = [
  {
    item: 'Whole milk 1 gal',
    price: 3.89,
    store: 'Kroger',
    date: 'Oct 21',
    comparison: 'Matches listed price',
    differs: false,
  },
  {
    item: 'White bread 20 oz',
    price: 2.79,
    store: 'Kroger',
    date: 'Oct 21',
    comparison: 'Matches listed price',
    differs: false,
  },
  {
    item: 'Heinz ketchup 32 oz',
    price: 4.99,
    store: 'Target',
    date: 'Oct 14',
    comparison: '$0.20 above listed',
    differs: true,
  },
  {
    item: 'Boneless chicken breast',
    price: 4.29,
    store: 'Walmart',
    date: 'Oct 14',
    comparison: 'Matches listed price',
    differs: false,
  },
  {
    item: 'Bananas 2.4 lb',
    price: 1.49,
    store: 'Walmart',
    date: 'Oct 7',
    comparison: 'Matches listed price',
    differs: false,
  },
];

export const PLANS = [
  { key: 'year', name: 'Yearly', sub: '$2.08/month, billed yearly', price: '$24.99' },
  { key: 'month', name: 'Monthly', sub: 'Cancel anytime', price: '$3.99' },
  { key: 'life', name: 'Lifetime', sub: 'One payment', price: '$59' },
] as const;

export type PlanKey = (typeof PLANS)[number]['key'];

export const PRO_FEATURES = [
  'Unlimited custom baskets',
  'Price history beyond 12 months',
  'State and store-level breakdowns',
  'Unlimited break alerts',
  'CSV and PNG export',
  'Home-screen widget',
];

export const METHODOLOGY: { k: string; v: string }[] = [
  {
    k: 'Fuel data',
    v: 'U.S. Energy Information Administration weekly on-highway retail diesel and gasoline, national, PADD region and state series. Weekly values are forward-filled to a daily grid.',
  },
  {
    k: 'Shelf prices',
    v: 'Listed prices captured daily from Walmart, Amazon, Target, Kroger, Albertsons, Costco and regional chains, per store ZIP where available. Promotional prices are tracked separately.',
  },
  {
    k: 'Basket index',
    v: 'Your basket is indexed to 100 at the start of the window and weighted by logged purchase frequency. The Delta is basket change minus fuel change, in percentage points.',
  },
  {
    k: 'Verdicts',
    v: 'Lagged cross-correlation (0–120 days) with an asymmetry test. Gouge Gap: upward pass-through more than twice downward, and fuel down more than 15% since the last increase.',
  },
  {
    k: 'Limitations',
    v: 'Fuel is one input among labor, packaging and commodity costs. A gap is not proof of intent. Moves under $0.03 or 0.5% are ignored.',
  },
];

export const SEARCH_SUGGESTIONS = [
  'heinz ketchup',
  'milk',
  'eggs',
  'paper towels',
  'https://www.target.com/p/heinz-ketchup-32oz',
];
