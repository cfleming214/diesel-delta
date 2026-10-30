import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AlertSnapshot } from '@/domain';

import { persistStorage } from './storage';

type AlertState = {
  /** Values seen at the last alert run; the next run compares against these. */
  snapshot: AlertSnapshot | null;
  lastRunAt: string | null;
  save: (snapshot: AlertSnapshot) => void;
  reset: () => void;
};

export const useAlertState = create<AlertState>()(
  persist(
    (set) => ({
      snapshot: null,
      lastRunAt: null,
      save: (snapshot) => set({ snapshot, lastRunAt: new Date().toISOString() }),
      reset: () => set({ snapshot: null, lastRunAt: null }),
    }),
    { name: 'dd.alerts', version: 1, storage: persistStorage },
  ),
);
