import { describe, expect, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useDeltaModel } from '@/data';
import { formatDate } from '@/domain';
import { usePrefs } from '@/store/prefs';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useDeltaModel', () => {
  test('waits for a region, then computes the Delta and verdict', async () => {
    usePrefs.getState().reset();
    const { result, rerender } = await renderHook(() => useDeltaModel({ window: 90 }), {
      wrapper,
    });
    expect(result.current.model).toBeUndefined();

    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    await rerender({});
    await waitFor(() => expect(result.current.model).toBeDefined());
    const m = result.current.model!;
    expect(m.delta.toFixed(1)).toBe('6.5');
    expect(m.severity).toBe('Wide gap');
    expect(formatDate(m.latestDate, true)).toBe('Oct 26, 2026');
    expect(m.verdict).toBe(
      'Diesel fell 4.2% over 90 days. Your basket rose 2.2% over the same period, a gap of 6.5 percentage points.',
    );
    expect(result.current.state).toBe('TX');
    expect(result.current.seriesName).toBe('Gulf Coast (PADD 3)');
  });
});
