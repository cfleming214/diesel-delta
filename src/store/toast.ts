import { create } from 'zustand';

export const TOAST_MS = 2200;
/** Toasts with an action (Undo) stay longer, to leave time to reach it. */
export const TOAST_ACTION_MS = 5000;

export type ToastAction = { label: string; onPress: () => void };

type ToastState = {
  message: string | null;
  action: ToastAction | null;
  /** Bumps on every show so repeated identical messages restart the timer. */
  id: number;
  show: (message: string, action?: ToastAction) => void;
  hide: () => void;
};

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  message: null,
  action: null,
  id: 0,
  show: (message, action) => {
    clearTimeout(timer);
    set((s) => ({ message, action: action ?? null, id: s.id + 1 }));
    timer = setTimeout(
      () => set({ message: null, action: null }),
      action ? TOAST_ACTION_MS : TOAST_MS,
    );
  },
  hide: () => {
    clearTimeout(timer);
    set({ message: null, action: null });
  },
}));

/** Imperative helper for event handlers: `toast('Price saved')`, or with an Undo action. */
export const toast = (message: string, action?: ToastAction) =>
  useToast.getState().show(message, action);
