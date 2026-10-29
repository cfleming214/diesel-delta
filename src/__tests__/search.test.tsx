import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { basketIds, usePrefs } from '@/store/prefs';
import { useToast } from '@/store/toast';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const mockPermission = { current: { granted: true, canAskAgain: true } as object | null };
jest.mock('expo-camera', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CameraView: (props: object) => createElement(View, props),
    useCameraPermissions: () => [mockPermission.current, jest.fn()],
  };
});

async function openSearch() {
  await renderRouter('./src/app', { initialUrl: '/search' });
  await screen.findByLabelText('Search items');
}

describe('Search', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    mockPermission.current = { granted: true, canAskAgain: true };
  });

  test('suggestions search, and Add/Added toggles basket membership', async () => {
    await openSearch();
    expect(
      screen.getByText("Type what's in your cart, scan a barcode, or paste a retailer link."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('heinz ketchup'));
    expect(await screen.findByText('$3.12 at Walmart')).toBeTruthy();
    expect(screen.getByText('$4.79 at Target')).toBeTruthy();
    // The 32 oz bottle is in the default basket; the 20 oz is not.
    expect(screen.getAllByText('Added')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Add'));
    expect(basketIds(usePrefs.getState().basket)).toContain('ketchup20');
    expect(useToast.getState().message).toBe('Heinz ketchup added to basket');
    expect(screen.getAllByText('Added')).toHaveLength(2);
  });

  test('a pasted retailer link resolves', async () => {
    await openSearch();
    await fireEvent.press(screen.getByText('Paste a link'));
    expect(await screen.findByText('Resolved from retailer link')).toBeTruthy();
    expect(screen.getByText('$4.79 at Target')).toBeTruthy();
  });

  test('no match', async () => {
    await openSearch();
    await fireEvent.changeText(screen.getByLabelText('Search items'), 'caviar');
    expect(await screen.findByText('No tracked item matches “caviar”.')).toBeTruthy();
  });

  test('a scanned barcode fills the search; unknown codes say so', async () => {
    await openSearch();
    await fireEvent.press(screen.getByLabelText('Scan a barcode'));
    expect(screen.getByText('Point the camera at a UPC or EAN barcode.')).toBeTruthy();
    await act(async () =>
      screen
        .getByTestId('barcode-camera')
        .props.onBarcodeScanned({ type: 'ean13', data: '0000000000017' }),
    );
    expect(screen.getByLabelText('Search items').props.value).toBe('Heinz ketchup 32 oz');
    expect(await screen.findByText('$4.79 at Target')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Scan a barcode'));
    await act(async () =>
      screen
        .getByTestId('barcode-camera')
        .props.onBarcodeScanned({ type: 'upc_a', data: '012345678905' }),
    );
    expect(screen.getByText('No tracked item matches barcode 012345678905.')).toBeTruthy();
  });

  test('asks for camera permission before scanning', async () => {
    mockPermission.current = { granted: false, canAskAgain: true };
    await openSearch();
    await fireEvent.press(screen.getByLabelText('Scan a barcode'));
    expect(screen.getByText('Allow camera')).toBeTruthy();
    expect(screen.queryByTestId('barcode-camera')).toBeNull();
  });
});
