import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { LagChart } from '@/components/LagChart';
import { BASKET, DAYS, FUEL } from '@/data/fixtures/series';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

async function setup(index: number | null = null) {
  const onIndexChange = jest.fn();
  await render(
    <GestureHandlerRootView>
      <LagChart
        fuel={FUEL}
        basket={BASKET}
        start={DAYS - 91}
        end={DAYS - 1}
        height={230}
        index={index}
        onIndexChange={onIndexChange}
        accessibilityValueText="Gap 4.0 points on Oct 26"
      />
    </GestureHandlerRootView>,
  );
  const chart = screen.getByLabelText('Basket and diesel, indexed to 100');
  await act(() =>
    fireEvent(chart, 'layout', { nativeEvent: { layout: { width: 362, height: 230 } } }),
  );
  return { chart, onIndexChange };
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('LagChart', () => {
  test('draws grid, gap fill, both series and the cursor once measured', async () => {
    const { chart } = await setup();
    const tree = JSON.stringify(screen.toJSON());
    // Gridline labels, the fuel path from the golden geometry, and the cursor at the latest day.
    for (const label of ['94', '96', '98', '100']) expect(tree).toContain(`"${label}"`);
    expect(tree).toContain('M0.0 34.9L4.0 41.4L8.0 49.0');
    expect(tree).toContain('"x1":362');
    expect(chart.props.accessibilityValue).toEqual({ text: 'Gap 4.0 points on Oct 26' });
  });

  test('dragging snaps to the nearest day with a haptic tick, and release resets', async () => {
    const Haptics = jest.requireMock<{ selectionAsync: jest.Mock }>('expo-haptics');
    const { onIndexChange } = await setup();
    fireGestureHandler(getByGestureTestId('lag-chart-pan'), [
      { state: State.BEGAN, x: 0 },
      { state: State.ACTIVE, x: 181 },
      { state: State.ACTIVE, x: 182 },
      { state: State.ACTIVE, x: 362 },
      { state: State.END, x: 362 },
    ]);
    await flush();
    // 181 and 182 both snap to day 45, so only one change (and one tick) is reported for them.
    expect(onIndexChange.mock.calls.map((c) => c[0])).toEqual([45, 90, null]);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  test('VoiceOver adjust steps a week at a time within the window', async () => {
    const { chart, onIndexChange } = await setup(null);
    await act(() =>
      fireEvent(chart, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } }),
    );
    expect(onIndexChange).toHaveBeenLastCalledWith(83);
    await act(() =>
      fireEvent(chart, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }),
    );
    expect(onIndexChange).toHaveBeenLastCalledWith(90);
  });
});
