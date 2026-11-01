import { Inter_400Regular, Inter_500Medium, useFonts } from '@expo-google-fonts/inter';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ErrorScreen } from '@/components/ErrorScreen';
import { QueryProvider } from '@/data';
import { installGlobalErrorHandler } from '@/lib/errors';
import { useAlertRunner } from '@/lib/useAlerts';
import { usePrefs, usePrefsHydrated } from '@/store/prefs';
import { colors } from '@/theme';
import { ToastHost } from '@/ui';
import { track } from '@/lib/telemetry';

SplashScreen.preventAutoHideAsync();
installGlobalErrorHandler();

/** Any screen that throws while rendering lands here (reported, with a retry). */
export const ErrorBoundary = ErrorScreen;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium });
  const hydrated = usePrefsHydrated();
  const ready = (fontsLoaded || fontError != null) && hydrated;
  const onboarded = usePrefs((s) => s.zip != null);
  useAlertRunner(ready && onboarded);
  useScreenTracking(ready, onboarded);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryProvider>
      <GestureHandlerRootView style={styles.root}>
        <Stack screenOptions={{ headerShown: false, contentStyle: styles.root }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="item/[id]" />
          <Stack.Screen name="product/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="retailers" />
          <Stack.Screen name="share" options={{ presentation: 'modal' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          <Stack.Screen name="dev/kitchen-sink" />
        </Stack>
        <ToastHost />
        <StatusBar style="light" />
      </GestureHandlerRootView>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});

/** app_open once per launch, then screen_view on every route change (route name only). */
function useScreenTracking(ready: boolean, onboarded: boolean) {
  const pathname = usePathname();
  useEffect(() => {
    if (ready) track('app_open');
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const [, first = '', second] = pathname.split('/');
    // Before onboarding, '/' only flashes on the way to the redirect.
    if (!onboarded && first !== 'onboarding') return;
    track('screen_view', {
      screen: first || 'today',
      ...(first === 'item' && second ? { item: second } : {}),
    });
  }, [ready, onboarded, pathname]);
}
