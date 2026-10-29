import type { FuelScope, FuelSeriesKind, RegionKey } from '../types';
import zip3 from './zip3.json';

/** EIA PADD (Petroleum Administration for Defense District), with PADD 1 split into 1A–1C. */
export type Padd = '1A' | '1B' | '1C' | '2' | '3' | '4' | '5';

/** The 50 states and DC with their PADD (EIA definitions). Territories have no EIA retail series. */
export const STATES: Record<string, { name: string; padd: Padd }> = {
  CT: { name: 'Connecticut', padd: '1A' },
  ME: { name: 'Maine', padd: '1A' },
  MA: { name: 'Massachusetts', padd: '1A' },
  NH: { name: 'New Hampshire', padd: '1A' },
  RI: { name: 'Rhode Island', padd: '1A' },
  VT: { name: 'Vermont', padd: '1A' },
  DE: { name: 'Delaware', padd: '1B' },
  DC: { name: 'District of Columbia', padd: '1B' },
  MD: { name: 'Maryland', padd: '1B' },
  NJ: { name: 'New Jersey', padd: '1B' },
  NY: { name: 'New York', padd: '1B' },
  PA: { name: 'Pennsylvania', padd: '1B' },
  FL: { name: 'Florida', padd: '1C' },
  GA: { name: 'Georgia', padd: '1C' },
  NC: { name: 'North Carolina', padd: '1C' },
  SC: { name: 'South Carolina', padd: '1C' },
  VA: { name: 'Virginia', padd: '1C' },
  WV: { name: 'West Virginia', padd: '1C' },
  IL: { name: 'Illinois', padd: '2' },
  IN: { name: 'Indiana', padd: '2' },
  IA: { name: 'Iowa', padd: '2' },
  KS: { name: 'Kansas', padd: '2' },
  KY: { name: 'Kentucky', padd: '2' },
  MI: { name: 'Michigan', padd: '2' },
  MN: { name: 'Minnesota', padd: '2' },
  MO: { name: 'Missouri', padd: '2' },
  NE: { name: 'Nebraska', padd: '2' },
  ND: { name: 'North Dakota', padd: '2' },
  SD: { name: 'South Dakota', padd: '2' },
  OH: { name: 'Ohio', padd: '2' },
  OK: { name: 'Oklahoma', padd: '2' },
  TN: { name: 'Tennessee', padd: '2' },
  WI: { name: 'Wisconsin', padd: '2' },
  AL: { name: 'Alabama', padd: '3' },
  AR: { name: 'Arkansas', padd: '3' },
  LA: { name: 'Louisiana', padd: '3' },
  MS: { name: 'Mississippi', padd: '3' },
  NM: { name: 'New Mexico', padd: '3' },
  TX: { name: 'Texas', padd: '3' },
  CO: { name: 'Colorado', padd: '4' },
  ID: { name: 'Idaho', padd: '4' },
  MT: { name: 'Montana', padd: '4' },
  UT: { name: 'Utah', padd: '4' },
  WY: { name: 'Wyoming', padd: '4' },
  AK: { name: 'Alaska', padd: '5' },
  AZ: { name: 'Arizona', padd: '5' },
  CA: { name: 'California', padd: '5' },
  HI: { name: 'Hawaii', padd: '5' },
  NV: { name: 'Nevada', padd: '5' },
  OR: { name: 'Oregon', padd: '5' },
  WA: { name: 'Washington', padd: '5' },
};

const ZIP3 = zip3 as Record<string, string>;

/** State abbreviation for a 5-digit ZIP, or null if it is outside the 50 states and DC. */
export function stateForZip(zip: string): string | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const st = ZIP3[zip.slice(0, 3)];
  return st && STATES[st] ? st : null;
}

export function regionForState(state: string): RegionKey {
  const padd = STATES[state]?.padd;
  if (!padd) return 'nat';
  if (padd.startsWith('1')) return 'east';
  return ({ '2': 'mid', '3': 'gulf', '4': 'rocky', '5': 'west' } as const)[padd as '2'];
}

/** EIA weekly retail price areas (the duoarea part of a series ID). */
export type FuelArea =
  | 'NUS'
  | 'R10'
  | 'R1X'
  | 'R1Y'
  | 'R1Z'
  | 'R20'
  | 'R30'
  | 'R40'
  | 'R50'
  | 'R5XCA'
  | 'SCA'
  | 'SCO'
  | 'SFL'
  | 'SMA'
  | 'SMN'
  | 'SNY'
  | 'SOH'
  | 'STX'
  | 'SWA';

export const AREA_NAMES: Record<FuelArea, string> = {
  NUS: 'U.S.',
  R10: 'East Coast (PADD 1)',
  R1X: 'New England (PADD 1A)',
  R1Y: 'Central Atlantic (PADD 1B)',
  R1Z: 'Lower Atlantic (PADD 1C)',
  R20: 'Midwest (PADD 2)',
  R30: 'Gulf Coast (PADD 3)',
  R40: 'Rocky Mountain (PADD 4)',
  R50: 'West Coast (PADD 5)',
  R5XCA: 'West Coast except California',
  SCA: 'California',
  SCO: 'Colorado',
  SFL: 'Florida',
  SMA: 'Massachusetts',
  SMN: 'Minnesota',
  SNY: 'New York',
  SOH: 'Ohio',
  STX: 'Texas',
  SWA: 'Washington',
};

export const PADD_AREA: Record<RegionKey, FuelArea> = {
  nat: 'NUS',
  east: 'R10',
  mid: 'R20',
  gulf: 'R30',
  rocky: 'R40',
  west: 'R50',
};

/** States with their own weekly retail series. EIA publishes state diesel only for California. */
const STATE_SERIES: Record<FuelSeriesKind, Record<string, FuelArea>> = {
  diesel: { CA: 'SCA' },
  gas: {
    CA: 'SCA',
    CO: 'SCO',
    FL: 'SFL',
    MA: 'SMA',
    MN: 'SMN',
    NY: 'SNY',
    OH: 'SOH',
    TX: 'STX',
    WA: 'SWA',
  },
};

const SUB_PADD: Partial<Record<Padd, FuelArea>> = { '1A': 'R1X', '1B': 'R1Y', '1C': 'R1Z' };

export type LocalSeries = { area: FuelArea; name: string; isState: boolean };

/**
 * The finest EIA series below PADD level for a state: the state's own series, else its PADD 1
 * sub-region, else West Coast except California. Null when the PADD average is the finest available.
 */
export function localSeries(state: string, kind: FuelSeriesKind): LocalSeries | null {
  const own = STATE_SERIES[kind][state];
  if (own) return { area: own, name: AREA_NAMES[own], isState: true };
  const padd = STATES[state]?.padd;
  const sub = padd ? SUB_PADD[padd] : undefined;
  if (sub) return { area: sub, name: AREA_NAMES[sub], isState: false };
  if (padd === '5') return { area: 'R5XCA', name: AREA_NAMES.R5XCA, isState: false };
  return null;
}

/** Series used for a state at a scope; `state` scope falls back to PADD when nothing finer exists. */
export function fuelArea(state: string, kind: FuelSeriesKind, scope: FuelScope): FuelArea {
  if (scope === 'national') return 'NUS';
  const padd = PADD_AREA[regionForState(state)];
  if (scope === 'padd') return padd;
  return localSeries(state, kind)?.area ?? padd;
}

/** EIA API v2 series ID for weekly retail on-highway diesel or regular gasoline, in $/gal. */
export const eiaSeriesId = (area: FuelArea, kind: FuelSeriesKind) =>
  kind === 'diesel' ? `EMD_EPD2D_PTE_${area}_DPG` : `EMM_EPMR_PTE_${area}_DPG`;

/** Every (area, kind) pair the app can request; the ingest job fetches exactly these. */
export const ALL_SERIES: { area: FuelArea; kind: FuelSeriesKind }[] = (() => {
  const out: { area: FuelArea; kind: FuelSeriesKind }[] = [];
  const base: FuelArea[] = ['NUS', 'R10', 'R1X', 'R1Y', 'R1Z', 'R20', 'R30', 'R40', 'R50', 'R5XCA'];
  for (const kind of ['diesel', 'gas'] as const) {
    for (const area of base) out.push({ area, kind });
    for (const area of new Set(Object.values(STATE_SERIES[kind]))) out.push({ area, kind });
  }
  return out;
})();
