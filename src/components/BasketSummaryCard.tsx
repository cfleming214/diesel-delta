import { router } from 'expo-router';
import { CaretRight } from '@/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PriceChange, ProductSummary } from '@/data';
import { money } from '@/domain';
import { colors } from '@/theme';
import { Card, Text } from '@/ui';

import { CHANGE_LABELS, formatChange } from './priceChange';

type Props = { products: ProductSummary[]; basketIds: string[] };

/**
 * The basket at today's cheapest prices, and how that total moved over 30 days, 90 days and a
 * year (each item's cheapest price then, from its change).
 */
export function basketTotals(products: readonly ProductSummary[], ids: readonly string[]) {
  const items = ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is ProductSummary => !!p);
  const now = items.reduce((s, p) => s + p.price, 0);
  const then = (k: keyof PriceChange) =>
    items.every((p) => p.change[k] != null)
      ? items.reduce((s, p) => s + p.price / (1 + p.change[k]! / 100), 0)
      : null;
  const change = Object.fromEntries(
    CHANGE_LABELS.map(([k]) => {
      const t = then(k);
      return [k, t ? ((now - t) / t) * 100 : null];
    }),
  ) as PriceChange;
  return { count: items.length, now, change };
}

export function BasketSummaryCard({ products, basketIds }: Props) {
  const t = basketTotals(products, basketIds);
  const words = { d30: '30 days', d90: '90 days', d365: '1 year' } as const;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your basket, ${t.count} items, ${money(t.now)}, ${CHANGE_LABELS.map(([k]) => `${words[k]} ${formatChange(t.change[k])}`).join(', ')}`}
      onPress={() => router.navigate('/basket')}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card padding={14} gap={10}>
        <View style={styles.top}>
          <View style={styles.flex}>
            <Text variant="section">Your basket</Text>
            <Text variant="caption" color={colors.neutral[400]}>
              {`${t.count} ${t.count === 1 ? 'item' : 'items'} at today's cheapest prices`}
            </Text>
          </View>
          <Text numeric style={styles.total}>
            {money(t.now)}
          </Text>
          <CaretRight size={16} color={colors.neutral[500]} />
        </View>
        <View style={styles.stats}>
          {CHANGE_LABELS.map(([k, label]) => (
            <View key={k} style={styles.stat}>
              <Text variant="caption" color={colors.neutral[400]}>
                {label}
              </Text>
              <Text
                numeric
                color={(t.change[k] ?? 0) > 0 ? colors.accentRamp[300] : colors.text}
                style={styles.statValue}
              >
                {formatChange(t.change[k])}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  total: { fontSize: 22, lineHeight: 28 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 16 },
});
