import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from './api';
import type { FuelScope, FuelSeriesKind, RegionKey } from './types';

const SIX_HOURS = 6 * 60 * 60 * 1000;

export const queryKeys = {
  zip: (zip: string) => ['zip', zip] as const,
  fuel: (region: RegionKey, kind: FuelSeriesKind, scope: FuelScope) =>
    ['fuel', region, kind, scope] as const,
  basket: (ids: readonly string[]) => ['basketIndex', [...ids].sort().join(',')] as const,
  item: (id: string, region: RegionKey) => ['item', id, region] as const,
};

export function useZipLookup(zip: string) {
  return useQuery({
    queryKey: queryKeys.zip(zip),
    queryFn: () => api.lookupZip(zip),
    enabled: /^\d{5}$/.test(zip),
    staleTime: Infinity,
  });
}

/** Fuel prices are weekly (EIA), so a 6-hour stale time is plenty. */
export function useFuelSeries(
  region: RegionKey | null,
  kind: FuelSeriesKind = 'diesel',
  scope: FuelScope = 'padd',
) {
  return useQuery({
    queryKey: queryKeys.fuel(region ?? 'nat', kind, scope),
    queryFn: () => api.getFuelSeries(region ?? 'nat', kind, scope),
    enabled: region != null,
    staleTime: SIX_HOURS,
    placeholderData: keepPreviousData,
  });
}

export function useBasketSeries(ids: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.basket(ids),
    queryFn: () => api.getBasketSeries(ids),
    placeholderData: keepPreviousData,
  });
}
