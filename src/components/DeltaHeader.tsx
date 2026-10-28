import { StyleSheet, View } from 'react-native';

import { sgn } from '@/domain';
import { alpha, colors, em, fonts } from '@/theme';
import { Kicker, Text } from '@/ui';

type Props = {
  dateLabel: string;
  /** Basket index minus fuel index at the selected day, in points. */
  gap: number;
  basketIndex: number;
  fuelIndex: number;
  fuelName?: string;
};

/** "GAP AT {date}" with the gap at 56pt, and a Basket/Diesel legend with index values. */
export function DeltaHeader({
  dateLabel,
  gap,
  basketIndex,
  fuelIndex,
  fuelName = 'Diesel',
}: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.gapCol}>
        <Kicker>{`Gap at ${dateLabel}`}</Kicker>
        <Text numeric style={styles.gap} accessibilityLabel={`Gap ${sgn(gap)} points`}>
          {sgn(gap)}
          <Text numeric variant="section" color={colors.neutral[400]} style={styles.pts}>
            {' pts'}
          </Text>
        </Text>
      </View>
      <View style={styles.legend}>
        <LegendRow color={colors.accent} label={`Basket ${basketIndex.toFixed(1)}`} />
        <LegendRow
          color={colors.neutral[400]}
          label={`${fuelName} ${fuelIndex.toFixed(1)}`}
          muted
        />
      </View>
    </View>
  );
}

function LegendRow({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text variant="bodySmall" numeric color={muted ? colors.neutral[400] : colors.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  gapCol: { gap: 2 },
  gap: {
    fontFamily: fonts.regular,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: em(-0.04, 56),
    textShadowColor: alpha(colors.accent, 0.45),
    textShadowRadius: 30,
  },
  pts: { fontFamily: fonts.regular, fontSize: 16, letterSpacing: 0 },
  legend: { gap: 4, alignItems: 'flex-end', paddingBottom: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 2 },
});
