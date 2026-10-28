import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout } from '@/theme';

import { ScreenBackground } from './ScreenBackground';

type Props = {
  children: ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Horizontal padding (20pt; 24pt on Onboarding). */
  paddingX?: number;
  /** Extra bottom space, e.g. to clear the tab bar. */
  bottomInset?: number;
  contentStyle?: ViewStyle;
};

/** Screen shell: radial ground, top safe area + 6pt, 20pt side padding. */
export function Screen({
  children,
  scroll = false,
  paddingX = layout.pageX,
  bottomInset = 0,
  contentStyle,
}: Props) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = {
    paddingTop: insets.top + layout.contentTop,
    paddingHorizontal: paddingX,
    paddingBottom: insets.bottom + bottomInset,
  };
  return (
    <View style={styles.root}>
      <ScreenBackground />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padding, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, padding, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
