import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

async function openChart() {
  await renderRouter('./src/app', { initialUrl: '/chart' });
  await screen.findByText('+4.0 pts gap');
}

async function adjust(label: string, actionName: 'increment' | 'decrement', times = 1) {
  for (let i = 0; i < times; i++) {
    await fireEvent(screen.getByLabelText(label), 'accessibilityAction', {
      nativeEvent: { actionName },
    });
  }
}

describe('Chart explorer', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    useUi.setState({ window: 90, lagWeeks: 0, series: 'diesel', scope: 'padd' });
  });

  test('shows the readout, best fit and correlation at zero lag', async () => {
    await openChart();
    expect(screen.getByText('Gulf Coast')).toBeTruthy();
    // Readout date and the axis end label.
    expect(screen.getAllByText('Oct 26')).toHaveLength(2);
    expect(screen.getByText('Basket $101.52 · 99.7')).toBeTruthy();
    expect(screen.getByText('Diesel $3.44 · 95.8')).toBeTruthy();
    expect(screen.getByText('Lag: none')).toBeTruthy();
    expect(screen.getByText('Best fit 12 wks')).toBeTruthy();
    expect(screen.getByText(/Correlation at this lag: 0\.00\./)).toBeTruthy();
  });

  test('the lag slider shifts the fuel line and updates the correlation', async () => {
    await openChart();
    await adjust('Lag', 'increment', 4);
    expect(useUi.getState().lagWeeks).toBe(4);
    expect(screen.getByText('Lag: 4 weeks')).toBeTruthy();
    expect(screen.getByText(/Correlation at this lag: 0\.38\./)).toBeTruthy();
    expect(screen.queryByText('+4.0 pts gap')).toBeNull();
  });

  test('Texas has no state diesel series, so the scope control offers U.S. and PADD only', async () => {
    await openChart();
    expect(screen.getByText('PADD')).toBeTruthy();
    expect(screen.queryByText('TX')).toBeNull();
    expect(screen.queryByText('Local')).toBeNull();
  });

  test('the state gasoline series is Pro-only and opens the paywall', async () => {
    await openChart();
    await act(() => fireEvent.press(screen.getByText('Gasoline')));
    await act(async () => fireEvent.press(await screen.findByText('TX')));
    expect(screen).toHavePathname('/paywall');
    expect(useUi.getState().scope).toBe('padd');
  });

  test('Pro users can switch to the Texas gasoline series', async () => {
    usePrefs.getState().unlockPro('year');
    await openChart();
    await act(() => fireEvent.press(screen.getByText('Gasoline')));
    await act(async () => fireEvent.press(await screen.findByText('TX')));
    expect(await screen.findByText('Texas')).toBeTruthy();
    expect(await screen.findByText(/^Gasoline \$/)).toBeTruthy();
    expect(screen.getByText(/Shifts the gasoline line forward/)).toBeTruthy();
    // Back to diesel: no Texas series, so the chart falls back to the PADD.
    await act(() => fireEvent.press(screen.getByText('Diesel')));
    expect(await screen.findByText('Gulf Coast')).toBeTruthy();
  });
});
