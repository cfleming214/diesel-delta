import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme';

/** Screen ground: radial-gradient(120% 55% at 0% 0%, #232532 0%, #161826 62%). */
export function ScreenBackground({ from = colors.groundFrom }: { from?: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="ground" cx="0%" cy="0%" fx="0%" fy="0%" rx="120%" ry="55%">
          <Stop offset="0" stopColor={from} />
          <Stop offset="0.62" stopColor={colors.groundTo} />
          <Stop offset="1" stopColor={colors.groundTo} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#ground)" />
    </Svg>
  );
}
