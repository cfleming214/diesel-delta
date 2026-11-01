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

describe('Search tab', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    mockPermission.current = { granted: true, canAskAgain: true };
  });

  test('lists every product; a suggestion filters, and + / check toggles the basket', async () => {
    await openSearch();
    expect(
      await screen.findByText('All 150 products · cheapest price · 30D, 90D and 1Y change'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('heinz ketchup'));
    expect(await screen.findByText('2 products')).toBeTruthy();
    expect(screen.getByText('$5.29 at Kroger')).toBeTruthy();
    expect(screen.getByText('$3.19 at Walmart')).toBeTruthy();
    // The 32 oz bottle is in the default basket; the 20 oz is not.
    expect(screen.getAllByLabelText('Remove Heinz ketchup from basket')).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Add Heinz ketchup to basket'));
    expect(basketIds(usePrefs.getState().basket)).toContain('ketchup20');
    expect(useToast.getState().message).toBe('Heinz ketchup added to basket');
    expect(screen.getAllByLabelText('Remove Heinz ketchup from basket')).toHaveLength(2);
  });

  test('rows show the cheapest price and the 30-day, 90-day and 1-year change', async () => {
    await openSearch();
    await fireEvent.changeText(screen.getByLabelText('Search items'), 'greek yogurt');
    const row = await screen.findByLabelText(
      'Greek yogurt 32 oz, $6.49 at Walmart, 30 days +10.2%, 90 days +14.1%, 1 year +22.7%',
    );
    expect(row).toBeTruthy();
    expect(screen.getByText('30D +10.2%')).toBeTruthy();
    expect(screen.getByText('1Y +22.7%')).toBeTruthy();
    await fireEvent.press(row);
    expect(screen).toHavePathname('/product/yogurt');
  });

  test('a pasted retailer link resolves', async () => {
    await openSearch();
    await fireEvent.press(await screen.findByText('Paste a link'));
    expect(await screen.findByText('Resolved from retailer link')).toBeTruthy();
    expect(screen.getByText('$5.29 at Kroger')).toBeTruthy();
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
    expect(await screen.findByText('$5.29 at Kroger')).toBeTruthy();
    expect(screen.queryByText('$3.19 at Walmart')).toBeNull();

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

describe('Product detail', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
  });

  test('headline, range, every retailer, and the basket button', async () => {
    await renderRouter('./src/app', { initialUrl: '/product/milk' });
    expect(await screen.findByText('Whole milk')).toBeTruthy();
    expect(screen.getByText('1 gal · Dairy')).toBeTruthy();
    expect(screen.getAllByText('$3.89').length).toBeGreaterThan(0);
    expect(screen.getByText('at Walmart · 0.0% over 90 days')).toBeTruthy();
    expect(screen.getByText('By retailer')).toBeTruthy();
    expect(
      screen.getByLabelText(/^Walmart, \$3\.89, 30D 0\.0%, 90D 0\.0%, 1Y \+8\.4%$/),
    ).toBeTruthy();
    expect(screen.getByLabelText(/^Amazon, \$4\.69/)).toBeTruthy();

    // Tapping a retailer makes it the headline; the range changes the period.
    await fireEvent.press(screen.getByLabelText(/^Kroger, \$4\.99/));
    expect(screen.getByText('at Kroger · +4.2% over 90 days')).toBeTruthy();
    await fireEvent.press(screen.getByText('1Y'));
    expect(screen.getByText('at Kroger · +19.1% over 1 year')).toBeTruthy();

    // Milk is in the default basket.
    await fireEvent.press(screen.getByText('In your basket'));
    expect(basketIds(usePrefs.getState().basket)).not.toContain('milk');
    expect(screen.getByText('Add to basket')).toBeTruthy();
  });

  test('unknown products say so', async () => {
    await renderRouter('./src/app', { initialUrl: '/product/caviar' });
    // After the query's two retries.
    expect(
      await screen.findByText('This product could not be loaded.', {}, { timeout: 8000 }),
    ).toBeTruthy();
  }, 15_000);
});
