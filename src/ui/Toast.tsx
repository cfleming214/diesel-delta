import { CheckCircle } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { useToast } from '@/store/toast';
import { colors, layout, radius, shadows } from '@/theme';

import { Text } from './Text';

/** Global toast host, 112pt from the bottom. Mount once in the root layout. */
export function ToastHost() {
  const message = useToast((s) => s.message);
  const id = useToast((s) => s.id);
  if (!message) return null;
  return (
    <View style={styles.host} pointerEvents="none">
      <Animated.View
        key={id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOut.duration(160)}
        style={styles.toast}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <CheckCircle size={16} color={colors.accent} />
        <Text variant="bodySmall">{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: layout.pageX,
    right: layout.pageX,
    bottom: 112,
    alignItems: 'center',
    zIndex: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
});
