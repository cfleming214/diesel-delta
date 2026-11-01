import { beforeEach, describe, expect, test } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';

describe('Retailer scorecard', () => {
  beforeEach(() => usePrefs.getState().setLocation('77002', 'TX', 'gulf'));

  test('lists the tracked chains by grade and expands one at a time', async () => {
    await renderRouter('./src/app', { initialUrl: '/retailers' });
    const kroger = await screen.findByLabelText(
      'Grade D−, Kroger, 144 items tracked, 38% rolled back',
    );
    const labels = () =>
      screen.getAllByRole('button', { name: /^Grade / }).map((b) => b.props.accessibilityLabel);
    expect(labels()).toEqual([
      'Grade D−, Kroger, 144 items tracked, 38% rolled back',
      'Grade D−, Amazon, 145 items tracked, 37% rolled back',
      'Grade F, Walmart, 146 items tracked, 28% rolled back',
    ]);
    expect(screen.queryByLabelText('Personal care 57%')).toBeNull();

    await fireEvent.press(kroger);
    expect(screen.getByLabelText('Personal care 57%')).toBeTruthy();
    expect(kroger.props.accessibilityState).toEqual({ expanded: true });

    await fireEvent.press(screen.getByText('Walmart'));
    expect(screen.queryByLabelText('Personal care 57%')).toBeNull();
    expect(screen.getByLabelText('Snacks 56%')).toBeTruthy();
  });

  test('sorts by items tracked', async () => {
    await renderRouter('./src/app', { initialUrl: '/retailers' });
    await screen.findByText('Kroger');
    await fireEvent.press(screen.getByText('Items tracked'));
    expect(
      screen.getAllByRole('button', { name: /^Grade / }).map((b) => b.props.accessibilityLabel),
    ).toEqual([
      'Grade F, Walmart, 146 items tracked, 28% rolled back',
      'Grade D−, Amazon, 145 items tracked, 37% rolled back',
      'Grade D−, Kroger, 144 items tracked, 38% rolled back',
    ]);
  });
});
