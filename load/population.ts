// Virtual users are spread across states in proportion to population (2020 Census, thousands), so
// the fuel series they request match the real mix of Gulf, East Coast, California and so on.
import { fuelArea, localSeries, PADD_AREA, regionForState, type FuelArea } from '@/data/geo';

export const STATE_POPULATION: Record<string, number> = {
  AL: 5024,
  AK: 733,
  AZ: 7152,
  AR: 3012,
  CA: 39538,
  CO: 5774,
  CT: 3606,
  DE: 990,
  DC: 690,
  FL: 21538,
  GA: 10712,
  HI: 1455,
  ID: 1839,
  IL: 12813,
  IN: 6786,
  IA: 3190,
  KS: 2938,
  KY: 4506,
  LA: 4658,
  ME: 1362,
  MD: 6177,
  MA: 7030,
  MI: 10077,
  MN: 5706,
  MS: 2961,
  MO: 6154,
  MT: 1084,
  NE: 1962,
  NV: 3105,
  NH: 1377,
  NJ: 9289,
  NM: 2118,
  NY: 20201,
  NC: 10439,
  ND: 779,
  OH: 11799,
  OK: 3959,
  OR: 4237,
  PA: 13003,
  RI: 1097,
  SC: 5118,
  SD: 887,
  TN: 6911,
  TX: 29146,
  UT: 3272,
  VT: 643,
  VA: 8631,
  WA: 7705,
  WV: 1794,
  WI: 5894,
  WY: 577,
};

const ENTRIES = Object.entries(STATE_POPULATION);
const TOTAL = ENTRIES.reduce((s, [, p]) => s + p, 0);

/** Picks a state with probability proportional to its population. */
export function pickState(random: () => number): string {
  let r = random() * TOTAL;
  for (const [state, pop] of ENTRIES) {
    r -= pop;
    if (r < 0) return state;
  }
  return ENTRIES[ENTRIES.length - 1]![0];
}

export type Place = {
  state: string;
  region: ReturnType<typeof regionForState>;
  /** Series shown during onboarding (the finest available for the state). */
  onboardingArea: FuelArea;
  /** Series the Today screen loads (PADD scope, the app default). */
  todayArea: FuelArea;
};

export function placeFor(state: string): Place {
  const region = regionForState(state);
  return {
    state,
    region,
    onboardingArea: localSeries(state, 'diesel')?.area ?? PADD_AREA[region],
    todayArea: fuelArea(state, 'diesel', 'padd'),
  };
}
