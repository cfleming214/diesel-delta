import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';
import { useReceipts } from '@/store/receipts';
import { useToast } from '@/store/toast';

jest.mock('expo-camera', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CameraView: (props: object) => createElement(View, props),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

// The mock provider simulates processing time; resolve at once under the router's fake timers.
jest.mock('@/lib/ocr', () => {
  const actual = jest.requireActual<typeof import('@/lib/ocr')>('@/lib/ocr');
  return { ...actual, ocr: { recognize: async () => actual.MOCK_RECEIPT_TEXT } };
});

async function openLog() {
  await renderRouter('./src/app', { initialUrl: '/log' });
  await screen.findByText('Private to this device');
}

describe('Receipt log', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    useReceipts.getState().clear();
  });

  test('starts empty', async () => {
    await openLog();
    expect(screen.getByText(/No prices logged yet/)).toBeTruthy();
  });

  test('scan → select lines → add compares against listed prices', async () => {
    await openLog();
    await fireEvent.press(screen.getByText('Scan receipt'));
    await fireEvent.press(screen.getByText('Capture'));
    expect(await screen.findByText('Kroger · Oct 28')).toBeTruthy();
    expect(screen.getByText('4 of 4 lines selected')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('FROZEN PEAS 12 OZ, $1.89'));
    expect(screen.getByText('3 of 4 lines selected')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add 3 prices'));

    expect(useToast.getState().message).toBe('3 prices added');
    const h = useReceipts.getState().history;
    expect(h.map((e) => [e.item, e.comparison])).toEqual([
      ['WHOLE MILK 1 GAL', 'Matches listed price'],
      ['LARGE EGGS 12 CT', '$0.05 below listed'],
      ['BANANAS 2.1 LB', '$0.02 above listed'],
    ]);
    expect(screen.getByText('$0.05 below listed')).toBeTruthy();
    expect(screen.getAllByText('Kroger · Oct 28')).toHaveLength(3);
  });

  test('manual entry validates, saves and persists on device', async () => {
    await openLog();
    await fireEvent.press(screen.getByText('Enter manually'));
    await fireEvent.press(screen.getByText('Save price'));
    expect(screen.getByText('Enter an item name.')).toBeTruthy();
    expect(screen.getByText('Enter a price above $0.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Item'), 'Heinz ketchup 32 oz');
    await fireEvent.changeText(screen.getByLabelText('Price paid'), '4.99');
    await fireEvent.press(screen.getByText('Target'));
    await fireEvent.press(screen.getByText('Save price'));

    expect(useToast.getState().message).toBe('Price saved');
    expect(screen.getByText('$0.20 above listed')).toBeTruthy();
    const saved = JSON.parse((await AsyncStorage.getItem('dd.receipts'))!);
    expect(saved.state.history[0]).toMatchObject({
      item: 'Heinz ketchup 32 oz',
      price: 4.99,
      store: 'Target',
    });
  });
});
