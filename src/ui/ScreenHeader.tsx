import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

type Props = { title: string; subtitle?: string; right?: ReactNode };

/** Flush-left h2 title (28/500) with a 12pt neutral-400 subtitle and optional right-side actions. */
export function ScreenHeader({ title, subtitle, right }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={colors.neutral[400]} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titles: { flex: 1 },
  subtitle: { marginTop: 4 },
  right: { flexDirection: 'row', gap: 8 },
});
