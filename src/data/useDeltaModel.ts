import { useMemo } from 'react';

import {
  computeDelta,
  dateAtIndex,
  verdictSentence,
  windowInfo,
  windowRange,
  type WindowDays,
} from '@/domain';
import { basketIds, usePrefs } from '@/store/prefs';

import { REGION_NAMES } from './regions';
import { useBasketSeries, useFuelSeries } from './queries';
import type { FuelScope, FuelSeriesKind } from './types';

type Options = { window: WindowDays; kind?: FuelSeriesKind; scope?: FuelScope };

/**
 * Fuel and basket series for the user's region and basket, with the Delta over the window.
 * Returns `model: undefined` until both series have loaded.
 */
export function useDeltaModel({ window, kind = 'diesel', scope = 'padd' }: Options) {
  const region = usePrefs((s) => s.region);
  const basket = usePrefs((s) => s.basket);
  const ids = useMemo(() => basketIds(basket), [basket]);
  const fuelQ = useFuelSeries(region, kind, scope);
  const basketQ = useBasketSeries(ids);

  const model = useMemo(() => {
    if (!fuelQ.data || !basketQ.data || ids.length === 0) return undefined;
    const fuel = fuelQ.data.values;
    const basketValues = basketQ.data.values;
    const { start, end } = windowRange(fuel.length, window);
    const delta = computeDelta(fuel, basketValues, window);
    const info = windowInfo(window);
    const seriesName = kind === 'diesel' ? 'Diesel' : 'Gasoline';
    return {
      fuel,
      basket: basketValues,
      start,
      end,
      startDate: fuelQ.data.startDate,
      latestDate: dateAtIndex(fuelQ.data.startDate, end),
      ...delta,
      windowLabel: info.label,
      verdict: verdictSentence(delta, info.label, seriesName),
    };
  }, [fuelQ.data, basketQ.data, window, kind, ids.length]);

  return {
    model,
    isLoading: fuelQ.isLoading || basketQ.isLoading,
    error: fuelQ.error ?? basketQ.error,
    basketEmpty: ids.length === 0,
    region,
    regionName: region ? REGION_NAMES[region] : undefined,
  };
}
