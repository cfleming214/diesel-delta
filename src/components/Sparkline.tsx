import { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

import { sparkPath } from '@/domain';

type Props = { values: readonly number[]; width: number; height: number; color: string };

/** Single-stroke trend line (1.4pt). */
export const Sparkline = memo(function Sparkline({ values, width, height, color }: Props) {
  return (
    <Svg width={width} height={height} style={{ overflow: 'visible' }} pointerEvents="none">
      <Path d={sparkPath(values, width, height)} fill="none" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
});
