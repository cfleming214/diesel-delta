import { create } from 'zustand';

import { DEFAULT_BASELINE, DEFAULT_WINDOW, type Baseline, type WindowDays } from '@/domain';
import type { FuelScope, FuelSeriesKind } from '@/data';

type UiState = {
  window: WindowDays;
  lagWeeks: number;
  series: FuelSeriesKind;
  scope: FuelScope;
  basketBaseline: Baseline;
  setWindow: (window: WindowDays) => void;
  setLagWeeks: (weeks: number) => void;
  setSeries: (series: FuelSeriesKind) => void;
  setScope: (scope: FuelScope) => void;
  setBasketBaseline: (baseline: Baseline) => void;
};

/** Ephemeral UI state shared across screens (not persisted). */
export const useUi = create<UiState>((set) => ({
  window: DEFAULT_WINDOW,
  lagWeeks: 0,
  series: 'diesel',
  scope: 'padd',
  basketBaseline: DEFAULT_BASELINE,
  setWindow: (window) => set({ window }),
  setLagWeeks: (lagWeeks) => set({ lagWeeks: Math.max(0, Math.min(12, Math.round(lagWeeks))) }),
  setSeries: (series) => set({ series }),
  setScope: (scope) => set({ scope }),
  setBasketBaseline: (basketBaseline) => set({ basketBaseline }),
}));
