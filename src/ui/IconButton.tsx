import type { Icon, IconWeight } from '@/ui/icons';
import { Pressable, StyleSheet } from 'react-native';

import { alpha, colors, layout, radius } from '@/theme';

type Props = {
  icon: Icon;
  accessibilityLabel: string;
  onPress?: () => void;
  /** Secondary (1px divider border) is the default; primary uses the accent outline. */
  variant?: 'primary' | 'secondary';
  size?: number;
  iconSize?: number;
  color?: string;
  weight?: IconWeight;
};

/** 44×44 icon button, radius 8. */
export function IconButton({
  icon: IconCmp,
  accessibilityLabel,
  onPress,
  variant = 'secondary',
  size = layout.hitTarget,
  iconSize = 20,
  color,
  weight = 'regular',
}: Props) {
  const primary = variant === 'primary';
  const fg = color ?? (primary ? colors.accent : colors.text);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={Math.max(0, (layout.hitTarget - size) / 2)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderColor: primary ? colors.accent : colors.divider },
        pressed && {
          backgroundColor: primary ? alpha(colors.accent, 0.22) : alpha(colors.text, 0.14),
        },
      ]}
    >
      <IconCmp size={iconSize} color={fg} weight={weight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
