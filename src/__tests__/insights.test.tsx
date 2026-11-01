import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { push } from '@/lib/push';
import { usePrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';

async function openInsights() {
  await renderRouter('./src/app', { initialUrl: '/insights' });
  await screen.findByText('Pass-through by category');
  await screen.findByText('Diesel −4.2%');
}

describe('Insights', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    useUi.setState({ window: 90 });
  });

  test('pass-through bars and the region table (golden values from the prototype)', async () => {
    await openInsights();
    expect(await screen.findByLabelText('Produce 71%')).toBeTruthy();
    expect(screen.getByLabelText('Household 6%')).toBeTruthy();
    expect(await screen.findByText('Diesel −4.2%')).toBeTruthy();
    // Basket +2.25% over 90 days against each region's diesel change.
    for (const [delta] of [
      ['+6.5 pts'],
      ['+6.1 pts'],
      ['+6.9 pts'],
      ['+5.6 pts'],
      ['+5.2 pts'],
      ['+6.3 pts'],
    ]) {
      expect(screen.getByText(delta!)).toBeTruthy();
    }
  });

  test('alerts start off and turn on only once notifications are allowed', async () => {
    await openInsights();
    expect(screen.getByText('Diesel crosses $3.25/gal')).toBeTruthy();
    expect(screen.getByText('Gulf Coast (PADD 3) retail diesel, weekly')).toBeTruthy();
    expect(screen.getByText('3 items followed')).toBeTruthy();
    const followed = screen.getByLabelText('A followed item drops in price');
    expect(followed.props.accessibilityState).toMatchObject({ checked: false });

    // Declined: the alert stays off and the screen says how to allow notifications.
    const request = jest.spyOn(push, 'request').mockResolvedValueOnce(false);
    await act(() => fireEvent.press(followed));
    expect(request).toHaveBeenCalled();
    expect(usePrefs.getState().alerts.followedDrop).toBe(false);
    expect(
      screen.getByText(/^Notifications are off for Diesel Data\. Allow them in Settings/),
    ).toBeTruthy();

    // Allowed: it turns on, and the note goes away.
    request.mockResolvedValueOnce(true);
    await act(() => fireEvent.press(followed));
    expect(usePrefs.getState().alerts.followedDrop).toBe(true);
    expect(screen.queryByText(/^Notifications are off/)).toBeNull();

    // Turning off never asks.
    request.mockClear();
    await act(() => fireEvent.press(followed));
    expect(usePrefs.getState().alerts.followedDrop).toBe(false);
    expect(request).not.toHaveBeenCalled();
    request.mockRestore();

    await fireEvent.press(screen.getByLabelText('Increase'));
    expect(usePrefs.getState().tolerance).toBe(4);
    expect(await screen.findByText(/tolerance 4 pts/)).toBeTruthy();
  });

  test('links: methodology sheet, retailers and Pro', async () => {
    await openInsights();
    expect(screen.getByLabelText('Diesel Data Pro, Free plan')).toBeTruthy();
    await fireEvent.press(screen.getByText('Methodology and sources'));
    expect(await screen.findByText('Limitations')).toBeTruthy();
    await act(() => fireEvent.press(screen.getByText('Retailer scorecard')));
    expect(screen).toHavePathname('/retailers');
  });
});
