import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';
import { useToast } from '@/store/toast';

// Screen tests use an instant store: the mock provider's simulated latency uses timers, which the
// router test renderer fakes.
jest.mock('@/lib/purchases', () => {
  const actual = jest.requireActual<typeof import('@/lib/purchases')>('@/lib/purchases');
  return { ...actual, purchases: actual.createMockPurchases(0) };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

async function openPaywall() {
  await renderRouter('./src/app', { initialUrl: '/paywall' });
  await screen.findByText('Start Pro · $24.99');
}

describe('Pro paywall', () => {
  beforeEach(async () => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    await AsyncStorage.removeItem('dd.mockStoreAccount');
  });

  test('plans, features and fine print', async () => {
    await openPaywall();
    expect(screen.getByText('More history, more baskets, local detail.')).toBeTruthy();
    expect(screen.getByText('Unlimited custom baskets')).toBeTruthy();
    const yearly = screen.getByLabelText('Yearly, $24.99, $2.08/month, billed yearly');
    expect(yearly.props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByText('Monthly'));
    expect(screen.getByText('Start Pro · $3.99')).toBeTruthy();
  });

  test('buying unlocks Pro, closes and toasts', async () => {
    await openPaywall();
    await fireEvent.press(screen.getByText('Lifetime'));
    await act(async () => {
      fireEvent.press(screen.getByText('Start Pro · $59'));
      await jest.advanceTimersByTimeAsync(50);
    });
    await waitFor(() => expect(usePrefs.getState()).toMatchObject({ isPro: true, plan: 'life' }));
    expect(useToast.getState().message).toBe('Pro unlocked');
    expect(screen).not.toHavePathname('/paywall');
  });

  test('restore finds an earlier purchase after app data is reset', async () => {
    await AsyncStorage.setItem('dd.mockStoreAccount', JSON.stringify({ plan: 'year' }));
    await openPaywall();
    await act(async () => {
      fireEvent.press(screen.getByText('Restore purchases'));
      await jest.advanceTimersByTimeAsync(50);
    });
    await waitFor(() => expect(usePrefs.getState()).toMatchObject({ isPro: true, plan: 'year' }));
    expect(useToast.getState().message).toBe('Pro restored');
  });

  test('restore with nothing to restore says so', async () => {
    await openPaywall();
    await act(async () => {
      fireEvent.press(screen.getByText('Restore purchases'));
      await jest.advanceTimersByTimeAsync(50);
    });
    await waitFor(() => expect(useToast.getState().message).toBe('No previous purchase found'));
    expect(usePrefs.getState().isPro).toBe(false);
  });

  test('Pro users see it as active', async () => {
    usePrefs.getState().unlockPro('month');
    await renderRouter('./src/app', { initialUrl: '/paywall' });
    expect(await screen.findByText('Pro is active')).toBeTruthy();
  });
});
