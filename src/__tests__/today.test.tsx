import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { highlightPools } from '@/data/highlights';
import { productSummaries } from '@/data/products';
import { usePrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

describe('Today', () => {
  beforeEach(() => {
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    useUi.getState().setWindow(90);
  });

  test('shows the gap, legend and verdict for the 90-day window', async () => {
    await renderRouter('./src/app');
    expect(await screen.findByText('Gap at Oct 26')).toBeTruthy();
    expect(screen.getByLabelText('Gap +6.5 points')).toBeTruthy();
    expect(screen.getByText('Basket 102.2')).toBeTruthy();
    expect(screen.getByText('Diesel 95.8')).toBeTruthy();
    expect(screen.getByText('Drag to scrub · indexed to 100')).toBeTruthy();
    expect(
      screen.getByText(
        'Diesel fell 4.2% over 90 days. Your basket rose 2.2% over the same period, a gap of 6.5 percentage points.',
      ),
    ).toBeTruthy();
  });

  test('switching the window recomputes the verdict', async () => {
    await renderRouter('./src/app');
    await screen.findByText('Gap at Oct 26');
    await act(() => fireEvent.press(screen.getByRole('tab', { name: '1Y' })));
    expect(
      screen.getByText(
        'Diesel fell 2.0% over 12 months. Your basket rose 6.2% over the same period, a gap of 8.2 percentage points.',
      ),
    ).toBeTruthy();
    expect(useUi.getState().window).toBe(365);
  });

  test('Share this chart opens the share card', async () => {
    await renderRouter('./src/app');
    await act(async () => fireEvent.press(await screen.findByText('Share this chart')));
    expect(screen).toHavePathname('/share');
  });

  test("shows the basket at today's cheapest prices with its 30D, 90D and 1Y change", async () => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    await renderRouter('./src/app');
    const card = await screen.findByLabelText(/^Your basket, 16 items, \$\d+\.\d\d, 30 days /);
    expect(card).toBeTruthy();
    expect(screen.getByText("16 items at today's cheapest prices")).toBeTruthy();
    await act(() => fireEvent.press(card));
    expect(screen).toHavePathname('/basket');
  });

  test('nationwide movers: 3 rising, 3 falling and 3 stable, each opening its product', async () => {
    await renderRouter('./src/app');
    expect(await screen.findByText('Nationwide movers')).toBeTruthy();
    expect(
      screen.getByText('Changes every minute · 30-day change at the cheapest store'),
    ).toBeTruthy();
    const labels = screen
      .getAllByLabelText(/^(Rising|Falling|Stable): /)
      .map((e) => e.props.accessibilityLabel as string);
    expect(labels).toHaveLength(9);
    for (const kind of ['Rising', 'Falling', 'Stable']) {
      expect(labels.filter((l) => l.startsWith(kind))).toHaveLength(3);
    }
    await act(() => fireEvent.press(screen.getByLabelText('Pause movers')));
    expect(screen.getByText('Paused · 30-day change at the cheapest store')).toBeTruthy();
    await act(() => fireEvent.press(screen.getAllByLabelText(/^Rising: /)[0]!));
    expect(screen).toHavePathname(`/product/${highlightPools(productSummaries()).rising[0]!.id}`);
  });
});
