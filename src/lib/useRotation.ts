import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * A page index that advances every `ms` while `active` (the screen is focused, the app is in the
 * foreground and the reader hasn't paused it), wrapping after `pages`.
 */
export function useRotation(pages: number, ms: number, active: boolean) {
  const [page, setPage] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active || !foreground || pages < 2) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), ms);
    return () => clearInterval(timer);
  }, [active, foreground, pages, ms]);

  return page % Math.max(1, pages);
}
