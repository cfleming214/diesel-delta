import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, shadows } from '@/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  gap?: number;
};

/** Surface card with the sm hairline elevation (`.card.elev-sm`). Default padding 14, gap 12. */
export function Card({ children, style, padding = 14, gap = 12 }: Props) {
  return <View style={[styles.card, { padding, gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, ...shadows.sm },
});
