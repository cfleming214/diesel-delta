import { beforeEach, describe, expect, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';

async function openItem(id: string) {
  await renderRouter('./src/app', { initialUrl: `/item/${id}` });
}

describe('Item detail', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
  });

  test('Gouge Gap item: header, verdict, stats and ledger', async () => {
    await openItem('milk');
    expect(await screen.findByText('Whole milk')).toBeTruthy();
    expect(screen.getByText('Dairy · 1 gal · Walmart')).toBeTruthy();
    expect(screen.getByText('Gouge Gap')).toBeTruthy();
    expect(
      screen.getByText(
        'Price rose once this year. Diesel has since fallen 9.0% with no price reduction.',
      ),
    ).toBeTruthy();
    // Shelf-price stat and the chart's high label.
    expect(screen.getAllByText('$3.89')).toHaveLength(2);
    expect(screen.getByText('$0.30')).toBeTruthy();
    expect(screen.getByText('−9.0%')).toBeTruthy();
    // Ledger, newest first: the same rise the product screen's 1-year change reflects.
    expect(screen.getByText('$3.59 → $3.89')).toBeTruthy();
    expect(screen.getByText('+8.4%')).toBeTruthy();
    expect(screen.getByText('Jan 23, 2026 · Diesel $3.78')).toBeTruthy();
    expect(screen.getAllByText('Fuel-correlated')).toHaveLength(1);
  });

  test('Tracking Fuel item shows a rollback', async () => {
    await openItem('bread');
    expect(await screen.findByText('Rollback')).toBeTruthy();
    expect(screen.getByText('Tracking Fuel')).toBeTruthy();
    expect(screen.getByText('Price rose and was reduced again as diesel fell.')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
  });

  test('follow toggles from the header', async () => {
    await openItem('eggs');
    await screen.findByText('Large eggs');
    await fireEvent.press(screen.getByLabelText('Follow'));
    expect(usePrefs.getState().followed).toContain('eggs');
    expect(screen.getByLabelText('Unfollow')).toBeTruthy();
  });

  test('Sources opens the provenance sheet', async () => {
    await openItem('milk');
    await act(async () => fireEvent.press(await screen.findByText('Sources')));
    expect(await screen.findByText('Data provenance')).toBeTruthy();
    expect(await screen.findByText('Walmart listed price, Whole milk 1 gal')).toBeTruthy();
    expect(screen.getByText('Oct 28, 2026 at 04:12 CT · store ZIP 77002')).toBeTruthy();
    // Corrections aren't built yet, so there is no button promising them.
    expect(screen.queryByText('Report a correction with a shelf-tag photo')).toBeNull();
  });

  test('unknown ids say so and point to Search', async () => {
    await openItem('caviar');
    expect(
      await screen.findByText(/^This item isn’t tracked\./, {}, { timeout: 4000 }),
    ).toBeTruthy();
    await act(() => fireEvent.press(screen.getByText('Search products')));
    expect(screen).toHavePathname('/search');
  });
});
