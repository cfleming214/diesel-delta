import { describe, expect, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

describe('app navigation', () => {
  test('opens on Today and switches tabs from the tab bar', async () => {
    await renderRouter('./src/app');
    expect(screen.getByText('TX 77002 · Oct 26, 2026')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(5);

    await act(() => fireEvent.press(screen.getByLabelText('Basket')));
    expect(screen.getByText('16 items · weighted by purchase frequency')).toBeTruthy();
  });

  test('pushes Search from Today and goes back', async () => {
    await renderRouter('./src/app');
    await act(() => fireEvent.press(screen.getByLabelText('Search')));
    expect(screen).toHavePathname('/search');
    await act(() => fireEvent.press(screen.getByLabelText('Back')));
    expect(screen).toHavePathname('/');
  });

  test('deep links to an item', async () => {
    await renderRouter('./src/app', { initialUrl: '/item/milk' });
    expect(screen).toHavePathname('/item/milk');
    expect(screen.getByText('milk')).toBeTruthy();
  });
});
