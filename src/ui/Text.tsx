import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, tabular, type } from '@/theme';

export type TextVariant = keyof typeof type;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: string;
  /** Tabular figures, for numbers and figures that update in place. */
  numeric?: boolean;
};

/**
 * Inter text with Nocturne styles. Pass `numeric` for figures: Inter's tabular feature also widens
 * punctuation such as hyphens, so it is not applied to running text.
 */
export function Text({
  variant = 'body',
  color = colors.text,
  numeric = false,
  style,
  ...rest
}: TextProps) {
  return <RNText {...rest} style={[type[variant], numeric && tabular, { color }, style]} />;
}
