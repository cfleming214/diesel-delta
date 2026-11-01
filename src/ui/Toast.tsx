import { CheckCircle } from '@/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { useToast } from '@/store/toast';
import { colors, layout, radius, shadows } from '@/theme';

import { Text } from './Text';

/**
 * Global toast host, docked 8pt above the floating tab bar (screens leave room for it at the end of
 * their content). An action, such as Undo, is the only part that takes touches. Mount once in the
 * root layout.
 */
export function ToastHost() {
  const message = useToast((s) => s.message);
  const action = useToast((s) => s.action);
  const id = useToast((s) => s.id);
  const insetBottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  if (!message) return null;
  const bottom = layout.tabBarBody + (insetBottom > 0 ? 28 : 10) + 8;
  return (
    <View style={[styles.host, { bottom }]} pointerEvents="box-none">
      <Animated.View
        key={id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOut.duration(160)}
        style={styles.toast}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <CheckCircle size={16} color={colors.accent} />
        <Text variant="bodySmall" style={styles.message}>
          {message}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              useToast.getState().hide();
              action.onPress();
            }}
            style={styles.action}
          >
            <Text variant="control" color={colors.accent}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { flexShrink: 1, paddingVertical: 6, paddingRight: 8 },
  action: {
    minWidth: layout.hitTarget,
    minHeight: layout.hitTarget,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  host: {
    position: 'absolute',
    left: layout.pageX,
    right: layout.pageX,
    alignItems: 'center',
    zIndex: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingVertical: 4,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
});
