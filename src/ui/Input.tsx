import type { Icon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type TextStyle } from 'react-native';

import { alpha, colors, fonts, radius, tabular } from '@/theme';

type Props = TextInputProps & {
  /** Inset leading icon (search field). */
  icon?: Icon;
  height?: number;
  textStyle?: TextStyle;
  invalid?: boolean;
};

/** `.input`: surface fill, 1px divider border that turns accent on focus. */
export function Input({
  icon: IconCmp,
  height = 44,
  textStyle,
  invalid,
  onFocus,
  onBlur,
  style,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, style]}>
      {IconCmp ? (
        <View style={styles.icon} pointerEvents="none">
          <IconCmp size={16} color={colors.neutral[400]} />
        </View>
      ) : null}
      <TextInput
        placeholderTextColor={colors.neutral[500]}
        selectionColor={alpha(colors.accent, 0.3)}
        cursorColor={colors.accent}
        keyboardAppearance="dark"
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          tabular,
          { minHeight: height },
          IconCmp ? styles.withIcon : null,
          (focused || invalid) && { borderColor: invalid ? colors.accentRamp[300] : colors.accent },
          textStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  icon: { position: 'absolute', left: 12, zIndex: 1 },
  input: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
  withIcon: { paddingLeft: 34 },
});
