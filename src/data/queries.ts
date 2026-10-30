import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';

import { api } from './api';
import type { FuelArea } from './geo';
import type { FuelSeriesKind, RegionKey } from './types';

const SIX_HOURS = 6 * 60 * 60 * 1000;

export const queryKeys = {
  zip: (zip: string) => ['zip', zip] as const,
  fuel: (area: FuelArea, kind: FuelSeriesKind) => ['fuel', area, kind] as const,
  basket: (ids: readonly string[]) => ['basketIndex', [...ids].sort().join(',')] as const,
  item: (id: string, region: RegionKey) => ['item', id, region] as const,
  provenance: (id: string, zip: string) => ['provenance', id, zip] as const,
  catalog: ['catalog'] as const,
  search: (query: string) => ['search', query.trim().toLowerCase()] as const,
};

export function useZipLookup(zip: string) {
  return useQuery({
    queryKey: queryKeys.zip(zip),
    queryFn: () => api.lookupZip(zip),
    enabled: /^\d{5}$/.test(zip),
    staleTime: Infinity,
    // Unsupported ZIPs fail deterministically; show the message at once rather than retrying.
    retry: false,
  });
}

/** Fuel prices are weekly (EIA), so a 6-hour stale time is plenty. */
export function useFuelSeries(area: FuelArea | null, kind: FuelSeriesKind = 'diesel') {
  return useQuery({
    queryKey: queryKeys.fuel(area ?? 'NUS', kind),
    queryFn: () => api.getFuelSeries(area ?? 'NUS', kind),
    enabled: area != null,
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

const itemQuery = (id: string, region: RegionKey) => ({
  queryKey: queryKeys.item(id, region),
  queryFn: () => api.getItem(id, region),
});

export function useItem(id: string, region: RegionKey | null) {
  return useQuery({ ...itemQuery(id, region ?? 'nat'), enabled: region != null });
}

/** Item details for a list of ids, in order; entries are undefined until loaded. */
export function useItems(ids: readonly string[], region: RegionKey | null) {
  return useQueries({
    queries: ids.map((id) => ({ ...itemQuery(id, region ?? 'nat'), enabled: region != null })),
    combine: (results) => results.map((r) => r.data),
  });
}

export function useProvenance(id: string, zip: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.provenance(id, zip ?? ''),
    queryFn: () => api.getProvenance(id, zip ?? ''),
    enabled: enabled && zip != null,
  });
}

export function useBarcodeLookup() {
  return (code: string) => api.lookupBarcode(code);
}

export function useCatalogSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.search(query),
    queryFn: () => api.searchCatalog(query),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: queryKeys.catalog,
    queryFn: () => api.getCatalog(),
    staleTime: Infinity,
  });
}
