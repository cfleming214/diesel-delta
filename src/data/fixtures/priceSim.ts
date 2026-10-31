// Deterministic simulated grocery prices, shared by the app's product fixtures and the mock
// retailers in mock-server/retailMock.ts. Generated data for development only: every value is a
// function of a key and a day, so the same item, retailer and day always gives the same price.

export const SIM_RETAILERS = ['kroger', 'walmart', 'amazon'] as const;
export type SimRetailer = (typeof SIM_RETAILERS)[number];

/** Relative price level per retailer. */
export const RETAILER_FACTOR: Record<SimRetailer, number> = {
  kroger: 1,
  walmart: 0.94,
  amazon: 1.03,
};

/** FNV-1a: a stable 32-bit hash for seeding. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A uniform number in [0, 1) fixed by the key. */
export const rand = (key: string) => {
  let t = (hash(key) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Shelf-style price: rounded down to the dime, ending in 9. */
export const shelf = (p: number) => Math.max(0.29, Math.floor(p * 10) / 10 + 0.09);

const DAY_MS = 86_400_000;
export const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Up to 4 step changes in the year before 2026-11-01; about a third roll back later. */
export function stepFactor(key: string, day: number): number {
  const end = dayNumber('2026-11-01');
  let f = 1;
  for (let i = 0; i < 4; i++) {
    if (rand(`${key}:step:${i}`) > 0.6) continue;
    const at = end - 365 + Math.floor(rand(`${key}:step-at:${i}`) * 360);
    const up = 1 + 0.03 + rand(`${key}:step-size:${i}`) * 0.08;
    if (day >= at) f *= up;
    if (rand(`${key}:rollback:${i}`) < 0.35) {
      const back = at + 21 + Math.floor(rand(`${key}:rollback-at:${i}`) * 90);
      if (day >= back) f /= up;
    }
  }
  return f;
}

/** Each retailer carries about 97% of the catalog. */
export const isCarried = (retailer: SimRetailer, itemId: string) =>
  rand(`${retailer}:${itemId}:carried`) >= 0.03;
