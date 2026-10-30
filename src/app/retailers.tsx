import { CaretDown, CaretUp } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BackButton } from '@/components/BackButton';
import { useRetailerScores } from '@/data';
import { colors, radius } from '@/theme';
import { Screen, Text } from '@/ui';

/** Chains rolling back at least this share of fuel-driven increases get an accent grade. */
const GOOD_ROLLBACK = 45;

export default function RetailersScreen() {
  const retailers = useRetailerScores().data ?? [];
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Screen scroll bottomInset={24} contentStyle={styles.content}>
      <View style={styles.top}>
        <BackButton />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Retailer scorecard
        </Text>
        <Text variant="bodySmall" color={colors.neutral[400]}>
          Share of fuel-driven increases rolled back after diesel fell, category-weighted median
          across each chain&apos;s tracked items.
        </Text>
      </View>

      <View>
        {retailers.map((r) => {
          const isOpen = open === r.name;
          const good = r.rollbackPct >= GOOD_ROLLBACK;
          return (
            <View key={r.name} style={styles.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${r.name}, grade ${r.grade}, ${r.rollbackPct}% rolled back, ${r.itemsTracked} items tracked`}
                onPress={() => setOpen(isOpen ? null : r.name)}
                style={styles.row}
              >
                <View
                  style={[
                    styles.grade,
                    { borderColor: good ? colors.accent : colors.neutral[700] },
                  ]}
                >
                  <Text
                    color={good ? colors.accentRamp[300] : colors.neutral[300]}
                    style={styles.gradeText}
                  >
                    {r.grade}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text>{r.name}</Text>
                  <Text variant="caption" numeric color={colors.neutral[400]}>
                    {`${r.itemsTracked} items tracked`}
                  </Text>
                </View>
                <View style={styles.ratio}>
                  <Text numeric>{`${r.rollbackPct}%`}</Text>
                  <Text variant="caption" color={colors.neutral[500]} style={styles.small}>
                    rolled back
                  </Text>
                </View>
                {isOpen ? (
                  <CaretUp size={16} color={colors.neutral[500]} />
                ) : (
                  <CaretDown size={16} color={colors.neutral[500]} />
                )}
              </Pressable>
              {isOpen ? (
                <Animated.View entering={FadeIn.duration(160)} style={styles.cats}>
                  {r.categories.map((c) => (
                    <View
                      key={c.category}
                      style={styles.cat}
                      accessible
                      accessibilityLabel={`${c.category} ${c.pct}%`}
                    >
                      <Text variant="caption" color={colors.neutral[300]} style={styles.catName}>
                        {c.category}
                      </Text>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width: `${c.pct}%` }]} />
                      </View>
                      <Text variant="caption" numeric style={styles.catPct}>
                        {`${c.pct}%`}
                      </Text>
                    </View>
                  ))}
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </View>
      <Text variant="caption" color={colors.neutral[500]}>
        Updated daily. Open JSON endpoint available on the API tier.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  top: { flexDirection: 'row' },
  head: { gap: 4 },
  item: { borderBottomWidth: 1, borderBottomColor: colors.rowRule },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8 },
  grade: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: { fontSize: 17 },
  flex: { flex: 1, gap: 2 },
  ratio: { alignItems: 'flex-end' },
  small: { fontSize: 11 },
  cats: { gap: 8, paddingBottom: 14, paddingLeft: 58 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catName: { width: 76 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.neutral[900] },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  catPct: { width: 34, textAlign: 'right' },
});
