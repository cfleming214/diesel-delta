import type { Region, RegionKey } from './types';

/** Static region metadata (names do not change with data). */
export const REGION_NAMES: Record<RegionKey, Pick<Region, 'name' | 'state' | 'abbr'>> = {
  gulf: { name: 'Gulf Coast (PADD 3)', state: 'Texas', abbr: 'TX' },
  east: { name: 'East Coast (PADD 1)', state: 'New York', abbr: 'NY' },
  mid: { name: 'Midwest (PADD 2)', state: 'Ohio', abbr: 'OH' },
  rocky: { name: 'Rocky Mountain (PADD 4)', state: 'Colorado', abbr: 'CO' },
  west: { name: 'West Coast (PADD 5)', state: 'California', abbr: 'CA' },
  nat: { name: 'National', state: 'U.S.', abbr: 'US' },
};

/** "Gulf Coast (PADD 3)" → "Gulf Coast" */
export const shortRegionName = (name: string) => name.split(' (')[0]!;
