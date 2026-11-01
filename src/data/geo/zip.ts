import type { ZipLookup } from '../types';
import { AREA_NAMES, localSeries, PADD_AREA, regionForState, stateForZip, STATES } from './index';

export const ZIP_ERROR = 'Enter a 5-digit US ZIP code.';
export const ZIP_UNSUPPORTED = 'Diesel Data covers ZIP codes in the 50 states and DC.';

/** Everything about a ZIP that does not depend on prices. Throws with user-facing copy. */
export function describeZip(zip: string): Omit<ZipLookup, 'currentDiesel' | 'asOf'> {
  if (!/^\d{5}$/.test(zip)) throw new Error(ZIP_ERROR);
  const abbr = stateForZip(zip);
  if (!abbr) throw new Error(ZIP_UNSUPPORTED);
  const key = regionForState(abbr);
  const paddArea = PADD_AREA[key];
  const local = localSeries(abbr, 'diesel');
  return {
    zip,
    state: { abbr, name: STATES[abbr]!.name },
    region: { key, name: AREA_NAMES[paddArea] },
    dieselSeries: local
      ? { area: local.area, name: local.name, level: local.isState ? 'state' : 'subregion' }
      : { area: paddArea, name: AREA_NAMES[paddArea], level: 'padd' },
  };
}
