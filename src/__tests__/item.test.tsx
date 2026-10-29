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
    usePrefs.getState().setLocation('77002', 'gulf');
  });

  test('Gouge Gap item: header, verdict, stats and ledger', async () => {
    await openItem('milk');
    expect(await screen.findByText('Whole milk')).toBeTruthy();
    expect(screen.getByText('Dairy · 1 gal · Kroger')).toBeTruthy();
    expect(screen.getByText('Gouge Gap')).toBeTruthy();
    expect(
      screen.getByText(
        'Price rose twice while diesel climbed. Diesel has since fallen 13.3% with no price reduction.',
      ),
    ).toBeTruthy();
    // Shelf-price stat and the chart's high label.
    expect(screen.getAllByText('$3.89')).toHaveLength(2);
    expect(screen.getByText('$0.47')).toBeTruthy();
    expect(screen.getByText('−13.3%')).toBeTruthy();
    // Ledger, newest first.
    expect(screen.getByText('$3.66 → $3.89')).toBeTruthy();
    expect(screen.getByText('+6.4%')).toBeTruthy();
    expect(screen.getByText('Apr 6, 2026 · Diesel $3.97')).toBeTruthy();
    expect(screen.getAllByText('Fuel-correlated')).toHaveLength(2);
  });

  test('Tracking Fuel item shows a rollback', async () => {
    await openItem('eggs');
    expect(await screen.findByText('Rollback')).toBeTruthy();
    expect(
      screen.getByText('Price rose with diesel and was reduced again as diesel fell.'),
    ).toBeTruthy();
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
    expect(await screen.findByText('Kroger listed price, Whole milk 1 gal')).toBeTruthy();
    expect(screen.getByText('Oct 28, 2026 at 04:12 CT · store ZIP 77002')).toBeTruthy();
    expect(screen.getByText('Report a correction with a shelf-tag photo')).toBeTruthy();
  });

  test('unknown ids say so', async () => {
    await openItem('caviar');
    expect(
      await screen.findByText('This item is not tracked.', {}, { timeout: 4000 }),
    ).toBeTruthy();
  });
});
