import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BasketItemRow } from '@/components/BasketItemRow';
import { api } from '@/data';

describe('BasketItemRow', () => {
  test('shows name, verdict, store, price and change; reports presses', async () => {
    const milk = await api.getItem('milk', 'gulf');
    const onOpen = jest.fn();
    const onToggleFollow = jest.fn();
    await render(
      <BasketItemRow item={milk} followed onOpen={onOpen} onToggleFollow={onToggleFollow} />,
    );
    expect(screen.getByText('Whole milk · 1 gal')).toBeTruthy();
    expect(screen.getByText('Gouge Gap')).toBeTruthy();
    expect(screen.getByText('Kroger')).toBeTruthy();
    expect(screen.getByText('$3.89')).toBeTruthy();
    expect(screen.getByText('+13.6%')).toBeTruthy();
    expect(screen.queryByLabelText('Remove Whole milk')).toBeNull();

    await fireEvent.press(screen.getByText('Whole milk · 1 gal'));
    expect(onOpen).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Unfollow Whole milk'));
    expect(onToggleFollow).toHaveBeenCalled();
  });

  test('edit mode adds a remove button', async () => {
    const eggs = await api.getItem('eggs', 'gulf');
    const onRemove = jest.fn();
    await render(
      <BasketItemRow
        item={eggs}
        followed={false}
        editing
        onOpen={() => {}}
        onToggleFollow={() => {}}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByLabelText('Follow Large eggs')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove Large eggs'));
    expect(onRemove).toHaveBeenCalled();
  });
});
