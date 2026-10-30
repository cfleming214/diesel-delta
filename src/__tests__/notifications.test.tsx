import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { usePrefs } from '@/store/prefs';
import { useToast } from '@/store/toast';

const mockLast = { current: null as unknown };
const mockPermissions = { granted: false, canAskAgain: false };
jest.mock('expo-notifications', () => ({
  getLastNotificationResponse: () => mockLast.current,
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => mockPermissions,
  requestPermissionsAsync: async () => mockPermissions,
  scheduleNotificationAsync: async () => 'id',
}));

describe('notifications', () => {
  beforeEach(() => {
    usePrefs.getState().reset();
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    mockLast.current = null;
  });

  test('a tapped alert opens its item', async () => {
    mockLast.current = {
      actionIdentifier: 'default',
      notification: { request: { content: { data: { url: '/item/milk' } } } },
    };
    await renderRouter('./src/app');
    await waitFor(() => expect(screen).toHavePathname('/item/milk'));
    expect(await screen.findByText('Whole milk')).toBeTruthy();
  });

  test('turning an alert on asks for permission and explains a refusal', async () => {
    usePrefs.getState().setAlert('dieselCross', false);
    await renderRouter('./src/app', { initialUrl: '/insights' });
    await fireEvent.press(await screen.findByLabelText('Diesel crosses $3.25/gal'));
    await waitFor(() =>
      expect(useToast.getState().message).toBe('Turn on notifications in Settings to get alerts'),
    );
    expect(usePrefs.getState().alerts.dieselCross).toBe(true);
  });
});
