import { Inter_400Regular, Inter_500Medium, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { QueryProvider } from '@/data';
import { useAlertRunner } from '@/lib/useAlerts';
import { usePrefs, usePrefsHydrated } from '@/store/prefs';
import { colors } from '@/theme';
import { ToastHost } from '@/ui';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium });
  const hydrated = usePrefsHydrated();
  const ready = (fontsLoaded || fontError != null) && hydrated;
  const onboarded = usePrefs((s) => s.zip != null);
  useAlertRunner(ready && onboarded);

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
          <Stack.Screen name="search" />
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
