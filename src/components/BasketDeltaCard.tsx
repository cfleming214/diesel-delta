import { StyleSheet, View } from 'react-native';

import { BASELINES, money, smoney, type Baseline, type BasketAttribution } from '@/domain';
import { colors, em, fonts } from '@/theme';
import { Card, Kicker, Seg, Text } from '@/ui';

type Props = {
  attribution: BasketAttribution;
  baseline: Baseline;
  onBaselineChange: (baseline: Baseline) => void;
};

const OPTIONS = BASELINES.map((b) => ({ value: b, label: b }));

/** Basket dollar change since the baseline, split into fuel-attributable and no fuel link. */
export function BasketDeltaCard({ attribution: a, baseline, onBaselineChange }: Props) {
  return (
    <Card padding={16} gap={12}>
      <View style={styles.head}>
        <Kicker>Basket delta</Kicker>
        <Seg
          compact
          value={baseline}
          onChange={onBaselineChange}
          options={OPTIONS}
          accessibilityLabel="Baseline"
        />
      </View>
      <View style={styles.figure}>
        <Text numeric style={styles.change}>
          {smoney(a.change)}
        </Text>
        <Text variant="bodySmall" numeric color={colors.neutral[400]}>
          {`${money(a.from)} → ${money(a.to)}`}
        </Text>
      </View>
      <View
        style={styles.bar}
        accessibilityRole="image"
        accessibilityLabel={`${Math.round(a.fuelShare * 100)}% fuel-attributable`}
      >
        <View style={[styles.fuel, { flex: a.fuelShare }]} />
        <View style={[styles.non, { flex: a.noFuelShare }]} />
      </View>
      <View style={styles.legend}>
        <LegendItem
          swatch={colors.neutral[500]}
          color={colors.neutral[300]}
          label={`Fuel-attributable ${smoney(a.fuelAttributable)}`}
        />
        <LegendItem
          swatch={colors.accent}
          color={colors.accentRamp[300]}
          label={`No fuel link ${smoney(a.noFuelLink)}`}
        />
      </View>
    </Card>
  );
}

function LegendItem({ swatch, color, label }: { swatch: string; color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <Text variant="bodySmall" numeric color={color}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  change: {
    fontFamily: fonts.regular,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: em(-0.03, 40),
  },
  bar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
    backgroundColor: colors.neutral[900],
  },
  fuel: { backgroundColor: colors.neutral[500] },
  non: { backgroundColor: colors.accent },
  legend: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
});
