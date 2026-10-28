import type { ViewStyle } from 'react-native';

import { alpha } from './color';
import { colors } from './tokens';

/** Nocturne elevations: a 1px hairline ring plus ambient darkness (RN `boxShadow`). */
export const shadows = {
  sm: { boxShadow: `0 0 0 1px ${colors.neutral[800]}` },
  md: { boxShadow: `0 0 0 1px ${colors.neutral[700]}, 0 6px 18px rgba(0,0,0,0.55)` },
  lg: { boxShadow: `0 0 0 1px ${colors.neutral[500]}, 0 16px 40px rgba(0,0,0,0.65)` },
} satisfies Record<string, ViewStyle>;

/** Accent glow, e.g. the active tab mark (8pt) or the basket bar (10pt). */
export const glow = (radius: number, opacity = 1): ViewStyle => ({
  boxShadow: `0 0 ${radius}px ${alpha(colors.accent, opacity)}`,
});
