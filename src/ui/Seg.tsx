import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { alpha, colors, radius } from '@/theme';

import { Text } from './Text';

export type SegOption<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 38pt for the window control; 36pt elsewhere. */
  height?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
  /** Small inline control (12pt labels, 4/9 padding) that sizes to its content. */
  compact?: boolean;
};

/** Segmented control. The selected option gets accent text and a 1px inset accent ring. */
export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  height = 36,
  style,
  accessibilityLabel,
  compact = false,
}: Props<T>) {
  return (
    <View style={[styles.root, style]} accessibilityRole="tablist" aria-label={accessibilityLabel}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              compact ? styles.optCompact : styles.opt,
              { minHeight: compact ? 0 : height },
              i > 0 && styles.sep,
              selected && styles.selected,
              pressed && !selected && styles.pressed,
            ]}
          >
            <Text
              variant="bodySmall"
              color={selected ? colors.accent : colors.text}
              style={compact ? styles.compactLabel : undefined}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
  opt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  optCompact: { paddingVertical: 4, paddingHorizontal: 9 },
  compactLabel: { fontSize: 12, lineHeight: 16 },
  sep: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  selected: { boxShadow: `inset 0 0 0 1px ${colors.accent}` },
  pressed: { backgroundColor: alpha(colors.text, 0.07) },
});
