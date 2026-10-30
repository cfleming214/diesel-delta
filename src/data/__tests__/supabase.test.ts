/// <reference types="node" />
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ALL_SERIES, AREA_NAMES, eiaSeriesId } from '@/data';
import { EVENT_NAMES } from '@/domain';

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

describe('app_events migration', () => {
  test('its event-name check matches EVENT_NAMES', () => {
    const sql = readFileSync(
      join(__dirname, '../../../supabase/migrations/20261030000000_app_events.sql'),
      'utf8',
    );
    const list = /name in \(([^)]*)\)/s.exec(sql)![1]!;
    const names = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(names).toEqual([...EVENT_NAMES]);
  });
});
