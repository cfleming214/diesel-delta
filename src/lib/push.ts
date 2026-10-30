import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { AlertEvent } from '@/domain';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

/**
 * Alert delivery. The local provider shows notifications on this device (works in development
 * builds without a server). Production adds server-side Expo push from `evaluate-alerts`, using the
 * token from `registerToken()`.
 */
export interface PushProvider {
  permission(): Promise<PermissionState>;
  /** Asks the user if not decided yet. Resolves true when notifications are allowed. */
  request(): Promise<boolean>;
  deliver(event: AlertEvent): Promise<void>;
}

const toState = (s: Notifications.NotificationPermissionsStatus): PermissionState =>
  s.granted ? 'granted' : s.canAskAgain ? 'undetermined' : 'denied';

export const localPush: PushProvider = {
  async permission() {
    if (Platform.OS === 'web') return 'denied';
    return toState(await Notifications.getPermissionsAsync());
  },
  async request() {
    if (Platform.OS === 'web') return false;
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  },
  async deliver(event) {
    if (Platform.OS === 'web') return;
    await Notifications.scheduleNotificationAsync({
      content: { title: event.title, body: event.body, data: { url: event.url, kind: event.kind } },
      trigger: null,
    });
  },
};

export const push: PushProvider = localPush;

/** Show alerts as banners even while the app is open. */
export function configureForegroundNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
