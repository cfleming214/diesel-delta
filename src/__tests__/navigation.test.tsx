import { beforeEach, describe, expect, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';

describe('app navigation', () => {
  beforeEach(() => usePrefs.getState().setLocation('77002', 'TX', 'gulf'));

  test('opens on Today and switches tabs from the tab bar', async () => {
    await renderRouter('./src/app');
    expect(await screen.findByText('TX 77002 · Oct 26, 2026')).toBeTruthy();
    for (const tab of ['Today', 'Chart', 'Basket', 'Log', 'Insights']) {
      expect(screen.getByRole('tab', { name: tab })).toBeTruthy();
    }

    await act(() => fireEvent.press(screen.getByLabelText('Basket')));
    expect(screen.getByText('16 items · weighted by purchase frequency')).toBeTruthy();
  });

  test('pushes Search from Today and goes back', async () => {
    await renderRouter('./src/app');
    await act(() => fireEvent.press(screen.getByLabelText('Search')));
    expect(screen).toHavePathname('/search');
    await act(() => fireEvent.press(screen.getByLabelText('Back')));
    expect(screen).toHavePathname('/');
  });

  test('deep links to an item', async () => {
    await renderRouter('./src/app', { initialUrl: '/item/milk' });
    expect(screen).toHavePathname('/item/milk');
    expect(await screen.findByText('Whole milk')).toBeTruthy();
  });
});
