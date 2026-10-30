import { X } from '@/ui/icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { alpha, colors, layout, radius, shadows } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Distance (pt) the panel must be dragged down before it dismisses. */
const DISMISS_DRAG = 120;

/**
 * Bottom sheet: neutral-900 backdrop at 65% (tap to close), surface panel with a 14pt top radius,
 * lg shadow, max 80% height, 36×4 grabber and a close button. Drag the panel down to dismiss.
 */
export function Sheet({ visible, onClose, title, children }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dragY = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG || e.velocityY > 900) scheduleOnRN(onClose);
      dragY.value = withTiming(0, { duration: 160 });
    });

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.fill}>
        {visible ? (
          <>
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(160)}
              style={styles.fill}
            >
              <Pressable
                style={[styles.fill, styles.backdrop]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              />
            </Animated.View>
            <Animated.View
              entering={SlideInDown.duration(240)}
              exiting={SlideOutDown.duration(200)}
              style={[
                styles.panel,
                { maxHeight: height * 0.8, paddingBottom: insets.bottom + 12 },
                dragStyle,
              ]}
              accessibilityViewIsModal
            >
              <GestureDetector gesture={pan}>
                <View style={styles.head}>
                  <View style={styles.grabber} />
                  <View style={styles.titleRow}>
                    <Text variant="section" accessibilityRole="header" style={styles.title}>
                      {title}
                    </Text>
                    <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} />
                  </View>
                </View>
              </GestureDetector>
              <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            </Animated.View>
          </>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { backgroundColor: alpha(colors.neutral[900], 0.65) },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadows.lg,
  },
  head: { paddingHorizontal: layout.pageX, paddingTop: 8 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutral[700],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4 },
  title: { flex: 1 },
  body: { paddingHorizontal: layout.pageX },
});
