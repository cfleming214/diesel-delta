import { memo, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { lagChartGeometry, type LagChartGeometry } from '@/domain';
import { selectionTick } from '@/lib/haptics';
import { alpha, colors, fonts } from '@/theme';

type Props = {
  fuel: readonly number[];
  basket: readonly number[];
  start: number;
  end: number;
  lagDays?: number;
  height: number;
  /** Selected day within the window (0..count−1); `null` means the latest day. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Spoken summary of the selected day, for VoiceOver. */
  accessibilityValueText?: string;
  /** Let the chart extend this many points past its container on each side. */
  bleed?: number;
};

/** Days moved per VoiceOver increment/decrement. */
const A11Y_STEP = 7;

/**
 * Dual-series chart: basket (accent, glowing) over diesel (neutral-400), both indexed to 100 at the
 * window start, with the gap between them filled. Dragging snaps a cursor to the nearest day with a
 * haptic tick; releasing returns it to the latest day.
 */
export function LagChart({
  fuel,
  basket,
  start,
  end,
  lagDays = 0,
  height,
  index,
  onIndexChange,
  accessibilityValueText,
  bleed = 0,
}: Props) {
  const [width, setWidth] = useState(0);
  const geometry = useMemo(
    () =>
      width > 0 ? lagChartGeometry({ fuel, basket, start, end, lagDays, width, height }) : null,
    [fuel, basket, start, end, lagDays, width, height],
  );
  const count = end - start + 1;
  const lastIndex = useSharedValue(-1);

  const select = (i: number) => {
    selectionTick();
    onIndexChange(i);
  };
  const release = () => onIndexChange(null);

  const snap = (x: number) => {
    'worklet';
    const frac = width > 0 ? Math.min(1, Math.max(0, x / width)) : 1;
    const i = Math.round(frac * (count - 1));
    if (i !== lastIndex.value) {
      lastIndex.value = i;
      scheduleOnRN(select, i);
    }
  };

  const pan = Gesture.Pan()
    .withTestId('lag-chart-pan')
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onTouchesDown((e) => {
      const t = e.allTouches[0];
      if (t) snap(t.x);
    })
    .onUpdate((e) => snap(e.x))
    .onFinalize(() => {
      lastIndex.value = -1;
      scheduleOnRN(release);
    });

  const k = index ?? count - 1;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{ height, marginHorizontal: -bleed }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Basket and diesel, indexed to 100"
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={k}
        aria-valuetext={accessibilityValueText}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const step = e.nativeEvent.actionName === 'increment' ? A11Y_STEP : -A11Y_STEP;
          const next = Math.min(count - 1, Math.max(0, k + step));
          select(next);
        }}
      >
        {geometry ? (
          <Svg width={width} height={height} style={styles.svg}>
            <StaticLayer geometry={geometry} width={width} />
            <Cursor geometry={geometry} index={Math.min(k, geometry.count - 1)} height={height} />
          </Svg>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const StaticLayer = memo(function StaticLayer({
  geometry,
  width,
}: {
  geometry: LagChartGeometry;
  width: number;
}) {
  return (
    <>
      {geometry.grid.map((g) => (
        <Line
          key={`l${g.label}`}
          x1={0}
          x2={width}
          y1={g.y}
          y2={g.y}
          stroke={colors.divider}
          strokeDasharray="2 4"
        />
      ))}
      {geometry.grid.map((g) => (
        <SvgText
          key={`t${g.label}`}
          x={0}
          y={g.y - 3}
          fill={colors.neutral[500]}
          fontSize={10}
          fontFamily={fonts.regular}
        >
          {g.label}
        </SvgText>
      ))}
      <Path d={geometry.gapPath} fill={alpha(colors.accent, 0.14)} />
      <Path d={geometry.fuelPath} fill="none" stroke={colors.neutral[400]} strokeWidth={1.5} />
      {/* Glow: wide, faint strokes under the basket line (drop-shadow 6px). */}
      <Path
        d={geometry.basketPath}
        fill="none"
        stroke={alpha(colors.accent, 0.12)}
        strokeWidth={10}
        strokeLinejoin="round"
      />
      <Path
        d={geometry.basketPath}
        fill="none"
        stroke={alpha(colors.accent, 0.22)}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <Path
        d={geometry.basketPath}
        fill="none"
        stroke={colors.accent}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
    </>
  );
});

function Cursor({
  geometry,
  index,
  height,
}: {
  geometry: LagChartGeometry;
  index: number;
  height: number;
}) {
  const x = geometry.xs[index]!;
  return (
    <>
      <Line x1={x} x2={x} y1={0} y2={height} stroke={colors.neutral[600]} />
      <Circle
        cx={x}
        cy={geometry.fuelYs[index]}
        r={4}
        fill={colors.bg}
        stroke={colors.neutral[300]}
        strokeWidth={1.5}
      />
      <Circle cx={x} cy={geometry.basketYs[index]} r={4.5} fill={colors.accent} />
    </>
  );
}

const styles = StyleSheet.create({
  svg: { overflow: 'visible' },
});
