import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

describe('Today', () => {
  beforeEach(() => {
    usePrefs.getState().setLocation('77002', 'gulf');
    useUi.getState().setWindow(90);
  });

  test('shows the gap, legend and verdict for the 90-day window', async () => {
    await renderRouter('./src/app');
    expect(await screen.findByText('Gap at Oct 26')).toBeTruthy();
    expect(screen.getByLabelText('Gap +4.0 points')).toBeTruthy();
    expect(screen.getByText('Basket 99.7')).toBeTruthy();
    expect(screen.getByText('Diesel 95.8')).toBeTruthy();
    expect(screen.getByText('Drag to scrub · indexed to 100')).toBeTruthy();
    expect(
      screen.getByText(
        'Diesel fell 4.2% over 90 days. Your basket fell 0.3% over the same period, a gap of 4.0 percentage points.',
      ),
    ).toBeTruthy();
  });

  test('switching the window recomputes the verdict', async () => {
    await renderRouter('./src/app');
    await screen.findByText('Gap at Oct 26');
    await act(() => fireEvent.press(screen.getByText('1Y')));
    expect(
      screen.getByText(
        'Diesel fell 2.0% over 12 months. Your basket rose 5.3% over the same period, a gap of 7.3 percentage points.',
      ),
    ).toBeTruthy();
    expect(useUi.getState().window).toBe(365);
  });

  test('Share this chart opens the share card', async () => {
    await renderRouter('./src/app');
    await act(async () => fireEvent.press(await screen.findByText('Share this chart')));
    expect(screen).toHavePathname('/share');
  });
});
