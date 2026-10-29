import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { ItemDetail } from '@/data';
import { itemChartGeometry, money } from '@/domain';
import { alpha, colors } from '@/theme';
import { Text } from '@/ui';

const HEIGHT = 170;

/** 12-month shelf price (accent step line) against diesel (dashed), with the fuel-falling band. */
export function ItemPriceChart({ item }: { item: ItemDetail }) {
  const [width, setWidth] = useState(0);
  const g =
    width > 0
      ? itemChartGeometry({
          weeklyPrice: item.weeklyPrice,
          weeklyFuel: item.weeklyFuel,
          changeWeeks: item.changeWeeks,
          fuelFallingWeeks: item.fuelFallingWeeks,
          width,
          height: HEIGHT,
        })
      : null;
  const pHi = Math.max(...item.weeklyPrice);
  const pLo = Math.min(...item.weeklyPrice);
  const fHi = Math.max(...item.weeklyFuel);
  const fLo = Math.min(...item.weeklyFuel);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Price over 12 months, ${money(pLo)} to ${money(pHi)}, against diesel ${money(fLo)} to ${money(fHi)}`}
    >
      <View style={styles.axisRow}>
        <Caption>{money(pHi)}</Caption>
        <Caption>12 months</Caption>
        <Caption>{`${money(fHi)} diesel`}</Caption>
      </View>
      <View style={{ height: HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {g ? (
          <Svg width={width} height={HEIGHT} style={styles.svg}>
            <Rect
              x={g.band.x}
              y={0}
              width={g.band.width}
              height={HEIGHT}
              fill={alpha(colors.neutral[500], 0.1)}
            />
            <Path
              d={g.fuelPath}
              fill="none"
              stroke={colors.neutral[400]}
              strokeWidth={1.4}
              strokeDasharray="3 3"
            />
            <Path
              d={g.pricePath}
              fill="none"
              stroke={alpha(colors.accent, 0.25)}
              strokeWidth={5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Path d={g.pricePath} fill="none" stroke={colors.accent} strokeWidth={2} />
            {g.marks.map((m) => (
              <Circle
                key={`${m.x}`}
                cx={m.x}
                cy={m.y}
                r={3.5}
                fill={colors.bg}
                stroke={colors.accent}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={styles.axisRow}>
        <Caption>{money(pLo)}</Caption>
        <View style={styles.legend}>
          <LegendKey swatch={<View style={styles.priceKey} />} label="Price" />
          <LegendKey swatch={<View style={styles.fuelKey} />} label="Diesel" />
          <LegendKey swatch={<View style={styles.bandKey} />} label="Fuel falling" />
        </View>
        <Caption>{`${money(fLo)} diesel`}</Caption>
      </View>
    </View>
  );
}

function Caption({ children }: { children: string }) {
  return (
    <Text variant="caption" numeric color={colors.neutral[500]} style={styles.caption}>
      {children}
    </Text>
  );
}

function LegendKey({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <View style={styles.legendKey}>
      {swatch}
      <Caption>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  svg: { overflow: 'visible' },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caption: { fontSize: 11 },
  legend: { flexDirection: 'row', gap: 12 },
  legendKey: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceKey: { width: 10, height: 2, backgroundColor: colors.accent },
  fuelKey: {
    width: 10,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.neutral[400],
  },
  bandKey: { width: 10, height: 8, backgroundColor: alpha(colors.neutral[500], 0.25) },
});
