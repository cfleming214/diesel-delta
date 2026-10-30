import { GasPump } from '@/ui/icons';
import { useState, type Ref } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { lagChartGeometry } from '@/domain';
import { alpha, colors, em, fonts, radius, shadows } from '@/theme';
import { Text } from '@/ui';

export type Aspect = 'story' | 'x' | 'square';

/** On-screen card size (points) and the exported image size (pixels) for each aspect. */
export const ASPECTS: Record<
  Aspect,
  {
    label: string;
    w: number;
    h: number;
    pad: number;
    gap: number;
    num: number;
    body: number;
    export: { width: number; height: number };
  }
> = {
  story: {
    label: 'Story 9:16',
    w: 214,
    h: 380,
    pad: 18,
    gap: 12,
    num: 64,
    body: 12,
    export: { width: 1080, height: 1920 },
  },
  x: {
    label: 'X 16:9',
    w: 340,
    h: 191,
    pad: 14,
    gap: 6,
    num: 40,
    body: 10,
    export: { width: 1600, height: 900 },
  },
  square: {
    label: 'Square',
    w: 300,
    h: 300,
    pad: 16,
    gap: 9,
    num: 54,
    body: 11,
    export: { width: 1080, height: 1080 },
  },
};

type Props = {
  aspect: Aspect;
  windowLabel: string;
  deltaText: string;
  verdict: string;
  fuel: readonly number[];
  basket: readonly number[];
  start: number;
  end: number;
  asOf: string;
  place: string;
  link: string;
  ref?: Ref<HostInstance>;
};

/** Branded share image: Delta, verdict, mini chart and an honest "as of" footer. */
export function ShareCard({ ref, ...p }: Props) {
  const a = ASPECTS[p.aspect];
  const chartW = a.w - a.pad * 2;
  // The chart fills whatever height the text leaves.
  const [chartH, setChartH] = useState(0);
  const g =
    chartH > 0
      ? lagChartGeometry({
          fuel: p.fuel,
          basket: p.basket,
          start: p.start,
          end: p.end,
          width: chartW,
          height: chartH,
        })
      : null;
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width: a.w, height: a.h, padding: a.pad, gap: a.gap }]}
      accessibilityLabel={`Share card: ${p.deltaText} points gap over ${p.windowLabel}. ${p.verdict}`}
    >
      <Svg style={StyleSheet.absoluteFill} width={a.w} height={a.h}>
        <Defs>
          {/* radial-gradient(120% 70% at 0% 0%, glow, section 45%, bg) in explicit units */}
          <RadialGradient
            id="presence"
            gradientUnits="userSpaceOnUse"
            cx={0}
            cy={0}
            fx={0}
            fy={0}
            rx={a.w * 1.2}
            ry={a.h * 0.7}
          >
            <Stop offset="0" stopColor={colors.sectionGlow} />
            <Stop offset="0.45" stopColor={colors.section} />
            <Stop offset="1" stopColor={colors.bg} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={a.w} height={a.h} fill="url(#presence)" />
      </Svg>
      <View style={styles.top}>
        <View style={styles.brand}>
          <GasPump size={13} color={colors.accentRamp[200]} />
          <Text style={styles.kicker} color={colors.accentRamp[200]}>
            DieselDelta
          </Text>
        </View>
        <Text style={styles.kicker} color={colors.accentRamp[200]}>
          {p.windowLabel}
        </Text>
      </View>
      <View style={styles.figure}>
        <Text
          numeric
          style={[
            styles.num,
            { fontSize: a.num, lineHeight: a.num * 1.05, letterSpacing: em(-0.045, a.num) },
          ]}
        >
          {p.deltaText}
        </Text>
        <Text variant="bodySmall" color={colors.accentRamp[200]}>
          pts gap
        </Text>
      </View>
      <Text
        numeric
        color={colors.neutral[100]}
        style={{ fontSize: a.body, lineHeight: a.body * 1.4 }}
      >
        {p.verdict}
      </Text>
      <View
        style={styles.chart}
        onLayout={(e) => setChartH(Math.floor(e.nativeEvent.layout.height))}
      >
        {g ? (
          <Svg width={chartW} height={chartH}>
            <Path d={g.gapPath} fill={alpha(colors.accent, 0.22)} />
            <Path d={g.fuelPath} fill="none" stroke={colors.neutral[300]} strokeWidth={1.5} />
            <Path d={g.basketPath} fill="none" stroke={colors.accentRamp[300]} strokeWidth={2.2} />
          </Svg>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Text numeric color={colors.neutral[300]} style={[styles.foot, styles.flex]}>
          {`As of ${p.asOf} · ${p.place} · EIA retail diesel, retailer shelf prices`}
        </Text>
        <Text color={colors.accentRamp[200]} style={styles.foot}>
          {p.link}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.section,
    ...shadows.lg,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: em(0.1, 10),
    textTransform: 'uppercase',
  },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  num: {
    fontFamily: fonts.regular,
    textShadowColor: colors.accent,
    textShadowRadius: 28,
  },
  chart: { flex: 1, minHeight: 24 },
  footer: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  flex: { flex: 1 },
  foot: { fontSize: 9, lineHeight: 12 },
});
