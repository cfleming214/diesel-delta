import type { Icon, IconWeight } from '@/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';

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

/** Icon button, radius 8. Smaller sizes draw smaller but still take a 44×44 tap area. */
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
      onPress={onPress}
      style={styles.target}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.base,
            { width: size, height: size, borderColor: primary ? colors.accent : colors.divider },
            pressed && {
              backgroundColor: primary ? alpha(colors.accent, 0.22) : alpha(colors.text, 0.14),
            },
          ]}
        >
          <IconCmp size={iconSize} color={fg} weight={weight} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minWidth: layout.hitTarget,
    minHeight: layout.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
