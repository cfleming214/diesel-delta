import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { reportError } from '@/lib/errors';
import { colors } from '@/theme';
import { Button, Text } from '@/ui';

/** Shown when a screen throws while rendering: reports once and offers a retry. */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, { where: 'render' });
  }, [error]);
  return (
    <View style={styles.root} accessibilityRole="alert">
      <Text variant="title">Something went wrong</Text>
      <Text variant="body" color={colors.neutral[300]} style={styles.body}>
        This screen couldn’t be shown. Your basket and logged prices are safe on this device.
      </Text>
      <Button label="Try again" onPress={() => void retry()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: colors.bg,
  },
  body: { marginBottom: 8 },
});
