import { beforeEach, describe, expect, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';

async function openInsights() {
  await renderRouter('./src/app', { initialUrl: '/insights' });
  await screen.findByText('Gulf Coast');
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
    // Basket −0.25% over 90 days against each region's diesel change.
    for (const [delta] of [
      ['+4.0 pts'],
      ['+3.6 pts'],
      ['+4.4 pts'],
      ['+3.1 pts'],
      ['+2.7 pts'],
      ['+3.8 pts'],
    ]) {
      expect(screen.getByText(delta!)).toBeTruthy();
    }
  });

  test('alert toggles and tolerance update prefs', async () => {
    await openInsights();
    expect(screen.getByText('Diesel crosses $3.25/gal')).toBeTruthy();
    expect(screen.getByText('Gulf Coast (PADD 3) retail diesel, weekly')).toBeTruthy();
    expect(screen.getByText('3 items followed')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('A followed item drops in price'));
    expect(usePrefs.getState().alerts.followedDrop).toBe(false);
    await fireEvent.press(screen.getByLabelText('Increase'));
    expect(usePrefs.getState().tolerance).toBe(4);
    expect(await screen.findByText(/tolerance 4 pts/)).toBeTruthy();
  });

  test('links: methodology sheet, retailers and Pro', async () => {
    await openInsights();
    expect(screen.getByLabelText('DieselDelta Pro, Free plan')).toBeTruthy();
    await fireEvent.press(screen.getByText('Methodology and sources'));
    expect(await screen.findByText('Limitations')).toBeTruthy();
    await act(() => fireEvent.press(screen.getByText('Retailer scorecard')));
    expect(screen).toHavePathname('/retailers');
  });
});
