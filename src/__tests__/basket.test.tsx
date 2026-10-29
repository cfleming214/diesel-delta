import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { basketIds, usePrefs } from '@/store/prefs';
import { useToast } from '@/store/toast';
import { useUi } from '@/store/ui';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

async function openBasket() {
  await renderRouter('./src/app', { initialUrl: '/basket' });
  // Rows load independently; wait for the last of the 16.
  await screen.findByText('Spaghetti · 16 oz');
}

describe('Basket', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    useUi.setState({ basketBaseline: '1Y' });
  });

  test('Delta card splits the 12-month change', async () => {
    await openBasket();
    expect(screen.getByText('16 items · weighted by purchase frequency')).toBeTruthy();
    expect(screen.getByText('+$5.12')).toBeTruthy();
    expect(screen.getByText('$96.40 → $101.52')).toBeTruthy();
    expect(screen.getByText('Fuel-attributable −$0.21')).toBeTruthy();
    expect(screen.getByText('No fuel link +$5.33')).toBeTruthy();

    await fireEvent.press(screen.getByText('90D'));
    expect(screen.queryByText('+$5.12')).toBeNull();
    expect(useUi.getState().basketBaseline).toBe('90D');
  });

  test('rows open item detail and toggle follow', async () => {
    await openBasket();
    await fireEvent.press(screen.getByLabelText('Follow Large eggs'));
    expect(usePrefs.getState().followed).toContain('eggs');
    await act(() => fireEvent.press(screen.getByText('Whole milk · 1 gal')));
    expect(screen).toHavePathname('/item/milk');
  });

  test('edit mode removes with a toast and reorders', async () => {
    await openBasket();
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.press(screen.getByLabelText('Remove Whole milk'));
    expect(basketIds(usePrefs.getState().basket)).not.toContain('milk');
    expect(useToast.getState().message).toBe('Whole milk removed');
    expect(screen.getByText('15 items · weighted by purchase frequency')).toBeTruthy();

    // VoiceOver "Move down" on the first row (now eggs).
    const handle = screen.getByLabelText('Reorder Large eggs');
    const row = handle.parent!;
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    expect(basketIds(usePrefs.getState().basket).slice(0, 2)).toEqual(['bread', 'eggs']);

    await fireEvent.press(screen.getByText('Done'));
    expect(screen.queryByLabelText('Reorder Large eggs')).toBeNull();
  });

  test('dragging a handle two rows down moves the item', async () => {
    await openBasket();
    await fireEvent.press(screen.getByText('Edit'));
    fireGestureHandler(getByGestureTestId('reorder-0'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 70 },
      { state: State.ACTIVE, translationY: 130 },
      { state: State.END, translationY: 130 },
    ]);
    await waitFor(() =>
      expect(basketIds(usePrefs.getState().basket).slice(0, 3)).toEqual(['eggs', 'bread', 'milk']),
    );
  });

  test('an empty basket shows guidance on Basket and Today', async () => {
    for (const id of basketIds(usePrefs.getState().basket)) {
      usePrefs.getState().removeFromBasket(id);
    }
    await renderRouter('./src/app', { initialUrl: '/basket' });
    expect(
      await screen.findByText('Your basket is empty. Add the items you buy with the + button.'),
    ).toBeTruthy();
    await act(() => fireEvent.press(screen.getByRole('tab', { name: 'Today' })));
    expect(
      screen.getByText('Your basket is empty. Add the items you buy to see your Delta.'),
    ).toBeTruthy();
  });
});
