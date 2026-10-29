import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { SwipeToRemove } from '@/components/SwipeToRemove';

// Render the swipeable as already opened, so the action is pressable.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({
    children,
    renderRightActions,
  }: {
    children: ReactNode;
    renderRightActions: () => ReactNode;
  }) => (
    <>
      {children}
      {renderRightActions()}
    </>
  ),
}));

describe('SwipeToRemove', () => {
  test('the revealed action removes the row', async () => {
    const onRemove = jest.fn();
    await render(
      <SwipeToRemove label="Heinz ketchup" onRemove={onRemove}>
        <Text>Heinz ketchup · 32 oz</Text>
      </SwipeToRemove>,
    );
    expect(screen.getByText('Remove')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove Heinz ketchup'));
    expect(onRemove).toHaveBeenCalled();
  });
});
