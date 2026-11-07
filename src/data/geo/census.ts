// U.S. Census regions, the areas BLS publishes regional average prices for. Plain data with no
// imports, so the price bot and the mock server can use it too. supabase/migrations/
// 20261107000000_bls_products.sql has the same table as census_region(); a test keeps them equal.

export type CensusRegion = 'northeast' | 'midwest' | 'south' | 'west';

export const CENSUS_REGION_NAMES: Record<CensusRegion, string> = {
  northeast: 'Northeast',
  midwest: 'Midwest',
  south: 'South',
  west: 'West',
};

/** The 50 states and DC by Census region. */
export const CENSUS_REGION: Record<string, CensusRegion> = {
  CT: 'northeast',
  ME: 'northeast',
  MA: 'northeast',
  NH: 'northeast',
  RI: 'northeast',
  VT: 'northeast',
  NJ: 'northeast',
  NY: 'northeast',
  PA: 'northeast',
  IL: 'midwest',
  IN: 'midwest',
  MI: 'midwest',
  OH: 'midwest',
  WI: 'midwest',
  IA: 'midwest',
  KS: 'midwest',
  MN: 'midwest',
  MO: 'midwest',
  NE: 'midwest',
  ND: 'midwest',
  SD: 'midwest',
  DE: 'south',
  DC: 'south',
  FL: 'south',
  GA: 'south',
  MD: 'south',
  NC: 'south',
  SC: 'south',
  VA: 'south',
  WV: 'south',
  AL: 'south',
  KY: 'south',
  MS: 'south',
  TN: 'south',
  AR: 'south',
  LA: 'south',
  OK: 'south',
  TX: 'south',
  AZ: 'west',
  CO: 'west',
  ID: 'west',
  MT: 'west',
  NV: 'west',
  NM: 'west',
  UT: 'west',
  WY: 'west',
  AK: 'west',
  CA: 'west',
  HI: 'west',
  OR: 'west',
  WA: 'west',
};

/** Census region for a state abbreviation, or null outside the 50 states and DC. */
export const censusRegionForState = (state: string | null | undefined): CensusRegion | null =>
  (state && CENSUS_REGION[state.toUpperCase()]) || null;
