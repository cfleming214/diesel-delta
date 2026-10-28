import { beforeEach, describe, expect, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';

describe('onboarding', () => {
  beforeEach(() => usePrefs.getState().reset());

  test('a first launch redirects to onboarding', async () => {
    await renderRouter('./src/app');
    expect(screen).toHavePathname('/onboarding');
    expect(screen.getByText('When diesel falls, do grocery prices follow?')).toBeTruthy();
  });

  test('rejects short ZIPs, shows the fuel series, and continues to Today', async () => {
    await renderRouter('./src/app', { initialUrl: '/onboarding' });
    const input = screen.getByLabelText('Home ZIP code');

    await act(() => fireEvent.changeText(input, '77a0'));
    expect(input.props.value).toBe('770');
    await act(() => fireEvent.press(screen.getByText('Continue')));
    expect(screen.getByText('Enter a 5-digit US ZIP code.')).toBeTruthy();

    await act(() => fireEvent.changeText(input, '77002'));
    expect(screen.queryByText('Enter a 5-digit US ZIP code.')).toBeNull();
    expect(await screen.findByText('Gulf Coast (PADD 3)')).toBeTruthy();
    expect(screen.getByText('State series: Texas retail diesel')).toBeTruthy();
    expect(screen.getByText('Current price $3.44/gal, week of Oct 26, 2026')).toBeTruthy();

    await act(() => fireEvent.press(screen.getByText('Continue')));
    expect(screen).toHavePathname('/');
    expect(usePrefs.getState()).toMatchObject({ zip: '77002', region: 'gulf' });
  });
});
