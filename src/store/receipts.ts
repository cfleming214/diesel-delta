import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

export type ReceiptEntry = {
  id: string;
  item: string;
  price: number;
  store: string;
  /** ISO purchase date. */
  date: string;
  comparison: string;
  /** Paid price differs from the listed price. */
  differs: boolean;
};

type ReceiptState = {
  history: ReceiptEntry[];
  /** Prepends entries (newest first). */
  add: (entries: Omit<ReceiptEntry, 'id'>[]) => void;
  clear: () => void;
};

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Receipt price history. Kept on this device only; never uploaded. */
export const useReceipts = create<ReceiptState>()(
  persist(
    (set) => ({
      history: [],
      add: (entries) =>
        set((s) => ({ history: [...entries.map((e) => ({ ...e, id: newId() })), ...s.history] })),
      clear: () => set({ history: [] }),
    }),
    { name: 'dd.receipts', version: 1, storage: persistStorage },
  ),
);
