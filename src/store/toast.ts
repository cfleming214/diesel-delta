import { create } from 'zustand';

export const TOAST_MS = 2200;

type ToastState = {
  message: string | null;
  /** Bumps on every show so repeated identical messages restart the timer. */
  id: number;
  show: (message: string) => void;
  hide: () => void;
};

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  message: null,
  id: 0,
  show: (message) => {
    clearTimeout(timer);
    set((s) => ({ message, id: s.id + 1 }));
    timer = setTimeout(() => set({ message: null }), TOAST_MS);
  },
  hide: () => {
    clearTimeout(timer);
    set({ message: null });
  },
}));

/** Imperative helper for event handlers: `toast('Price saved')`. */
export const toast = (message: string) => useToast.getState().show(message);
