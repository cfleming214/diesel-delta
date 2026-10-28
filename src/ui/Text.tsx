import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, tabular, type } from '@/theme';

export type TextVariant = keyof typeof type;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: string;
};

/** Inter text with Nocturne styles. Every number uses tabular figures, so they are on by default. */
export function Text({ variant = 'body', color = colors.text, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[type[variant], tabular, { color }, style]} />;
}
