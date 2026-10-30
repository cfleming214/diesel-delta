import { beforeEach, describe, expect, test } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';

describe('Retailer scorecard', () => {
  beforeEach(() => usePrefs.getState().setLocation('77002', 'TX', 'gulf'));

  test('lists chains with grades and expands one at a time', async () => {
    await renderRouter('./src/app', { initialUrl: '/retailers' });
    const costco = await screen.findByLabelText(
      'Costco, grade B+, 64% rolled back, 212 items tracked',
    );
    expect(screen.getByText('Albertsons')).toBeTruthy();
    expect(screen.queryByLabelText('Produce 78%')).toBeNull();

    await fireEvent.press(costco);
    expect(screen.getByLabelText('Produce 78%')).toBeTruthy();
    expect(costco.props.accessibilityState).toEqual({ expanded: true });

    await fireEvent.press(screen.getByText('Kroger'));
    expect(screen.queryByLabelText('Produce 78%')).toBeNull();
    expect(screen.getByLabelText('Produce 62%')).toBeTruthy();
  });
});
