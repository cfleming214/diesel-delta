import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TOAST_MS, toast, useToast } from '@/store/toast';
import { KVRow, Sheet, Text, ToastHost } from '@/ui';

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 54, left: 0, right: 0, bottom: 34 },
};

describe('toast', () => {
  afterEach(() => {
    useToast.getState().hide();
    jest.useRealTimers();
  });

  test('shows a message and auto-dismisses after 2.2s', async () => {
    jest.useFakeTimers();
    await render(<ToastHost />);
    await act(() => toast('Price saved'));
    expect(screen.getByText('Price saved')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(TOAST_MS - 1));
    expect(screen.getByText('Price saved')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(1));
    expect(useToast.getState().message).toBeNull();
  });

  test('a new message restarts the timer', () => {
    jest.useFakeTimers();
    toast('First');
    jest.advanceTimersByTime(2000);
    toast('Second');
    jest.advanceTimersByTime(2000);
    expect(useToast.getState().message).toBe('Second');
  });
});

describe('Sheet', () => {
  test('renders title and rows, and closes from the close button', async () => {
    const onClose = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet visible title="Methodology and sources" onClose={onClose}>
          <KVRow k="Fuel data" v="EIA weekly retail diesel" />
          <Text>Body</Text>
        </Sheet>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Methodology and sources')).toBeTruthy();
    expect(screen.getByText('EIA weekly retail diesel')).toBeTruthy();
    const closeButtons = screen.getAllByLabelText('Close');
    await fireEvent.press(closeButtons[closeButtons.length - 1]!);
    expect(onClose).toHaveBeenCalled();
  });
});
