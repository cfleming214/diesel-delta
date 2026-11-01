import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { money } from '@/domain';
import { colors } from '@/theme';
import { Text } from '@/ui';

import { RETAILER_STYLE } from './priceChange';

type Series = { retailer: string; values: number[] };

type Props = {
  series: Series[];
  height?: number;
  /** Scrub position (index into the values), or null for none. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Spoken summary, e.g. "Price over 90 days, $3.89 to $4.29". */
  accessibilityLabel: string;
};

const PAD = { top: 10, bottom: 18, left: 0, right: 44 };

/**
 * Full-width price history: one line per retailer (own color and dash), a dollar axis on the
 * right, and press-and-drag scrubbing that reports the day under the finger.
 */
export function ProductPriceChart({
  series,
  height = 220,
  index,
  onIndexChange,
  accessibilityLabel,
}: Props) {
  const [width, setWidth] = useState(0);
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || hi * 0.1 || 1;
  const yLo = lo - span * 0.12;
  const yHi = hi + span * 0.12;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const y = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * plotH;

  const scrubTo = (e: GestureResponderEvent) => {
    if (n < 2 || plotW <= 0) return;
    const i = Math.round(((e.nativeEvent.locationX - PAD.left) / plotW) * (n - 1));
    onIndexChange(Math.max(0, Math.min(n - 1, i)));
  };

  // Gridlines at the lowest price, the midpoint and the highest price, so every line sits on or
  // between labelled levels.
  const ticks = lo === hi ? [lo] : [lo, (lo + hi) / 2, hi];
  const labels = endLabels(series, y, plotH + PAD.top);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={scrubTo}
      onResponderMove={scrubTo}
      onResponderRelease={() => onIndexChange(null)}
      onResponderTerminate={() => onIndexChange(null)}
    >
      {width > 0 && n > 1 ? (
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <Line
              key={t}
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={colors.rowRule}
              strokeWidth={1}
            />
          ))}
          {series.map((s) => {
            const st = RETAILER_STYLE[s.retailer] ?? { color: colors.accent, dash: '' };
            const d = s.values
              .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
              .join(' ');
            return (
              <Path
                key={s.retailer}
                d={d}
                fill="none"
                stroke={st.color}
                strokeWidth={2}
                strokeDasharray={st.dash || undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
          {index != null ? (
            <>
              <Line
                x1={x(index)}
                x2={x(index)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={colors.neutral[400]}
                strokeWidth={1}
              />
              {series.map((s) =>
                s.values[index] == null ? null : (
                  <Circle
                    key={s.retailer}
                    cx={x(index)}
                    cy={y(s.values[index]!)}
                    r={4}
                    fill={colors.bg}
                    stroke={(RETAILER_STYLE[s.retailer] ?? { color: colors.accent }).color}
                    strokeWidth={2}
                  />
                ),
              )}
            </>
          ) : null}
        </Svg>
      ) : null}
      {width > 0 && n > 1
        ? labels.map((l) => (
            <Text
              key={l.retailer}
              variant="caption"
              color={l.color}
              style={[styles.lineLabel, { top: l.top, right: PAD.right + 4 }]}
            >
              {l.retailer}
            </Text>
          ))
        : null}
      {width > 0
        ? ticks.map((t) => (
            <Text
              key={t}
              variant="caption"
              numeric
              color={colors.neutral[500]}
              style={[styles.tick, { top: y(t) - 8 }]}
            >
              {money(t)}
            </Text>
          ))
        : null}
    </View>
  );
}

const LABEL_H = 14;

/**
 * A name label for each line, just above its last point at the right edge, nudged apart so two
 * close lines' labels don't overlap.
 */
function endLabels(series: Series[], y: (v: number) => number, bottom: number) {
  const placed = series
    .filter((s) => s.values.length > 0)
    .map((s) => ({
      retailer: s.retailer,
      color: (RETAILER_STYLE[s.retailer] ?? { color: colors.accent }).color,
      top: y(s.values.at(-1)!) - LABEL_H - 2,
    }))
    .sort((a, b) => a.top - b.top);
  for (let i = 1; i < placed.length; i++) {
    placed[i]!.top = Math.max(placed[i]!.top, placed[i - 1]!.top + LABEL_H);
  }
  const overflow = placed.length ? placed.at(-1)!.top + LABEL_H - bottom : 0;
  if (overflow > 0) for (const p of placed) p.top -= overflow;
  return placed.map((p) => ({ ...p, top: Math.max(0, p.top) }));
}

const styles = StyleSheet.create({
  lineLabel: { position: 'absolute', fontSize: 11, lineHeight: LABEL_H, textAlign: 'right' },
  tick: { position: 'absolute', right: 0, fontSize: 11, width: PAD.right - 4, textAlign: 'right' },
});
