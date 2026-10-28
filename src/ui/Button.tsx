import type { Icon } from 'phosphor-react-native';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { alpha, colors, radius, type } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: Icon;
  /** Minimum height: 44 by default, 48 for screen actions, 50 for pinned CTAs. */
  height?: number;
  /** 16pt label used by pinned CTAs; 14pt otherwise. */
  large?: boolean;
  block?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

const fg: Record<ButtonVariant, string> = {
  primary: colors.accent,
  secondary: colors.text,
  ghost: colors.accent,
};

const pressedBg: Record<ButtonVariant, string> = {
  primary: alpha(colors.accent, 0.22),
  secondary: alpha(colors.text, 0.14),
  ghost: alpha(colors.accent, 0.18),
};

/** Nocturne button. Primary is a 1px accent outline on transparent — never a fill. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon: IconCmp,
  height = 44,
  large = false,
  block = false,
  disabled = false,
  style,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        { minHeight: height },
        block && styles.block,
        pressed && { backgroundColor: pressedBg[variant] },
        disabled && styles.disabled,
        style,
      ]}
    >
      {IconCmp ? <IconCmp size={large ? 20 : 18} color={fg[variant]} /> : null}
      <Text style={[type.control, large && styles.largeLabel]} color={fg[variant]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: { borderColor: colors.accent },
  secondary: { borderColor: colors.divider },
  ghost: { paddingHorizontal: 2.8 },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },
  largeLabel: { fontSize: 16, lineHeight: 20 },
});
