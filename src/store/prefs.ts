import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_BASKET_IDS,
  DEFAULT_FOLLOWED_IDS,
  regionForState,
  stateForZip,
  type PlanKey,
  type RegionKey,
} from '@/data';

import { persistStorage } from './storage';

export type BasketEntry = { id: string; /** Relative purchase frequency. */ weight: number };

export type AlertPrefs = { dieselCross: boolean; followedDrop: boolean; deltaTolerance: boolean };

type Prefs = {
  zip: string | null;
  /** Two-letter state (or DC) for the ZIP. */
  state: string | null;
  region: RegionKey | null;
  /** Ordered basket. */
  basket: BasketEntry[];
  followed: string[];
  alerts: AlertPrefs;
  dieselThreshold: number;
  /** Delta tolerance in percentage points (1–15). */
  tolerance: number;
  isPro: boolean;
  plan: PlanKey | null;
};

type Actions = {
  setLocation: (zip: string, state: string, region: RegionKey) => void;
  /** Appends an item (no-op if already in the basket). */
  addToBasket: (id: string) => void;
  removeFromBasket: (id: string) => void;
  /** Moves the item at `from` to position `to`. */
  moveBasketItem: (from: number, to: number) => void;
  toggleFollow: (id: string) => void;
  unlockPro: (plan: PlanKey) => void;
  reset: () => void;
};

export const DEFAULT_PREFS: Prefs = {
  zip: null,
  state: null,
  region: null,
  basket: DEFAULT_BASKET_IDS.map((id) => ({ id, weight: 1 })),
  followed: DEFAULT_FOLLOWED_IDS,
  alerts: { dieselCross: true, followedDrop: true, deltaTolerance: true },
  dieselThreshold: 3.25,
  tolerance: 3,
  isPro: false,
  plan: null,
};

/** User preferences, persisted on device. */
export const usePrefs = create<Prefs & Actions>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      setLocation: (zip, state, region) => set({ zip, state, region }),
      addToBasket: (id) =>
        set((s) =>
          s.basket.some((b) => b.id === id) ? s : { basket: [...s.basket, { id, weight: 1 }] },
        ),
      removeFromBasket: (id) => set((s) => ({ basket: s.basket.filter((b) => b.id !== id) })),
      moveBasketItem: (from, to) =>
        set((s) => {
          const last = s.basket.length - 1;
          const a = Math.min(last, Math.max(0, from));
          const b = Math.min(last, Math.max(0, to));
          if (a === b) return s;
          const basket = s.basket.slice();
          const [moved] = basket.splice(a, 1);
          basket.splice(b, 0, moved!);
          return { basket };
        }),
      toggleFollow: (id) =>
        set((s) => ({
          followed: s.followed.includes(id)
            ? s.followed.filter((f) => f !== id)
            : [...s.followed, id],
        })),
      unlockPro: (plan) => set({ isPro: true, plan }),
      reset: () => set(DEFAULT_PREFS),
    }),
    {
      name: 'dd.prefs',
      version: 2,
      storage: persistStorage,
      migrate: (persisted, version) => migratePrefs(persisted as Partial<Prefs>, version),
    },
  ),
);

/**
 * v1 stored a region from the prototype's first-digit ZIP mapping and no state. v2 derives both
 * from the real ZIP table; ZIPs outside the 50 states and DC go back through onboarding.
 */
export function migratePrefs(persisted: Partial<Prefs>, version: number): Partial<Prefs> {
  if (version >= 2 || !persisted.zip) return persisted;
  const state = stateForZip(persisted.zip);
  return state
    ? { ...persisted, state, region: regionForState(state) }
    : { ...persisted, zip: null, state: null, region: null };
}

/** True once persisted prefs have been read from storage. */
export function usePrefsHydrated() {
  return useSyncExternalStore(
    (onChange) => usePrefs.persist.onFinishHydration(onChange),
    () => usePrefs.persist.hasHydrated(),
  );
}

export const basketIds = (basket: BasketEntry[]) => basket.map((b) => b.id);
