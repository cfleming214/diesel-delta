import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { runAlerts } from './alertRunner';
import { configureForegroundNotifications } from './push';

/** Minimum gap between alert runs; fuel data is weekly, so this is generous. */
const MIN_INTERVAL_MS = 15 * 60 * 1000;

/** Runs alert rules on launch and whenever the app returns to the foreground. */
export function useAlertRunner(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    configureForegroundNotifications();
    let last = 0;
    const run = () => {
      if (Date.now() - last < MIN_INTERVAL_MS) return;
      last = Date.now();
      runAlerts().catch(() => {});
    };
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [enabled]);
}

/**
 * Opens the route carried in a tapped notification, including the one that launched the app. Call
 * from a layout inside the navigator so the router is ready.
 */
export function useNotificationLinks() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification?.request?.content?.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
