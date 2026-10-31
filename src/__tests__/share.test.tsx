import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { mockLinks } from '@/lib/links';
import { usePrefs } from '@/store/prefs';
import { useToast } from '@/store/toast';
import { useUi } from '@/store/ui';

const mockCapture = jest.fn(async (..._args: unknown[]) => 'file:///tmp/card.png');
const mockCreate = jest.fn(async (_uri: string) => ({}));
const mockPermission = jest.fn(async (_writeOnly?: boolean) => ({ granted: true }));
const mockShare = jest.fn(async (..._args: unknown[]) => {});

jest.mock('react-native-view-shot', () => ({ captureRef: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: (w?: boolean) => mockPermission(w),
  Asset: { create: (uri: string) => mockCreate(uri) },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: (...a: unknown[]) => mockShare(...a),
}));

async function openShare() {
  await renderRouter('./src/app', { initialUrl: '/share' });
  await screen.findByLabelText(/^Share card: 6\.5 points gap over 90 days/);
}

describe('Share card', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    useUi.setState({ window: 90 });
    for (const m of [mockCapture, mockCreate, mockPermission, mockShare]) m.mockClear();
  });

  test('renders the Delta, verdict, as-of footer and a stable short link', async () => {
    await openShare();
    expect(screen.getByText('6.5')).toBeTruthy();
    expect(
      screen.getByText('As of Oct 26, 2026 · TX 77002 · EIA retail diesel, retailer shelf prices'),
    ).toBeTruthy();
    const link = mockLinks.shortLink({ state: 'TX', window: 90, asOf: 'Oct 26, 2026' });
    expect(link).toMatch(/^dd\.app\/d\/[a-z2-9]{4}$/);
    expect(screen.getByText(link)).toBeTruthy();
  });

  test('Save image captures at story size and saves with add-only access', async () => {
    await openShare();
    await fireEvent.press(screen.getByText('Save image'));
    await waitFor(() => expect(useToast.getState().message).toBe('Image saved to Photos'));
    expect(mockCapture.mock.calls[0]![1]).toMatchObject({
      format: 'png',
      width: 1080,
      height: 1920,
    });
    expect(mockPermission).toHaveBeenCalledWith(true);
    expect(mockCreate).toHaveBeenCalledWith('file:///tmp/card.png');
  });

  test('switching to X size exports 1600×900; denied Photos access says so', async () => {
    mockPermission.mockResolvedValueOnce({ granted: false });
    await openShare();
    await fireEvent.press(screen.getByText('X 16:9'));
    await fireEvent.press(screen.getByText('Save image'));
    await waitFor(() =>
      expect(useToast.getState().message).toBe('Allow Photos access in Settings to save'),
    );
    expect(mockCapture.mock.calls[0]![1]).toMatchObject({ width: 1600, height: 900 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('Share opens the native share sheet with the PNG', async () => {
    await openShare();
    await fireEvent.press(screen.getByText('Share'));
    await waitFor(() => expect(mockShare).toHaveBeenCalled());
    expect(mockShare.mock.calls[0]![0]).toBe('file:///tmp/card.png');
    expect(mockShare.mock.calls[0]![1]).toMatchObject({ mimeType: 'image/png' });
  });
});
