import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useRotation } from '../useRotation';

describe('useRotation', () => {
  let emit: (s: AppStateStatus) => void = () => {};
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      emit = fn as (s: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('advances every interval and wraps after the last page', async () => {
    const { result } = await renderHook(() => useRotation(3, 60_000, true));
    expect(result.current).toBe(0);
    await act(() => jest.advanceTimersByTime(59_999));
    expect(result.current).toBe(0);
    await act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe(1);
    await act(() => jest.advanceTimersByTime(120_000));
    expect(result.current).toBe(0);
  });

  test('holds while inactive (paused or off-screen) and resumes', async () => {
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useRotation(4, 60_000, active),
      { initialProps: { active: false } },
    );
    await act(() => jest.advanceTimersByTime(300_000));
    expect(result.current).toBe(0);
    await rerender({ active: true });
    await act(() => jest.advanceTimersByTime(60_000));
    expect(result.current).toBe(1);
  });

  test('holds in the background', async () => {
    const { result } = await renderHook(() => useRotation(4, 60_000, true));
    await act(() => emit('background'));
    await act(() => jest.advanceTimersByTime(300_000));
    expect(result.current).toBe(0);
    await act(() => emit('active'));
    await act(() => jest.advanceTimersByTime(60_000));
    expect(result.current).toBe(1);
  });

  test('a single page never rotates', async () => {
    const { result } = await renderHook(() => useRotation(1, 60_000, true));
    await act(() => jest.advanceTimersByTime(600_000));
    expect(result.current).toBe(0);
  });
});
