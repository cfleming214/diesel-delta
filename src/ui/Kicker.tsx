import { colors } from '@/theme';

import { Text, type TextProps } from './Text';

/** 11pt uppercase kicker with 0.1em tracking, accent-300 by default. */
export function Kicker({ color = colors.accentRamp[300], ...rest }: TextProps) {
  return <Text variant="kicker" color={color} {...rest} />;
}
