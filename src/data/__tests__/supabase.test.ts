/// <reference types="node" />
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ALL_SERIES, AREA_NAMES, eiaSeriesId } from '@/data';

const SEED = join(__dirname, '../../../supabase/migrations/20261029000100_fuel_series_seed.sql');

describe('fuel_series seed migration', () => {
  test('matches the series the app requests', () => {
    const rows = [
      ...readFileSync(SEED, 'utf8').matchAll(/\('(\w+)', '(\w+)', '(\w+)', '((?:[^']|'')+)'\)/g),
    ].map(([, area, kind, id, name]) => ({ area, kind, id, name: name!.replace(/''/g, "'") }));
    expect(rows).toEqual(
      ALL_SERIES.map(({ area, kind }) => ({
        area,
        kind,
        id: eiaSeriesId(area, kind),
        name: AREA_NAMES[area],
      })),
    );
  });
});
