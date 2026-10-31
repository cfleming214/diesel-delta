import { router, useIsFocused } from 'expo-router';
import { Minus, Pause, Play, TrendDown, TrendUp, type Icon } from '@/ui/icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import {
  highlightPage,
  highlightPools,
  pageCount,
  type HighlightKind,
  type ProductSummary,
} from '@/data';
import { money } from '@/domain';
import { useRotation } from '@/lib/useRotation';
import { colors } from '@/theme';
import { IconButton, Text } from '@/ui';

import { ProductAvatar } from './ProductAvatar';
import { formatChange } from './priceChange';

/** How often the highlighted products change. */
export const ROTATE_MS = 60_000;

const KIND: Record<HighlightKind, { label: string; icon: Icon }> = {
  rising: { label: 'Rising', icon: TrendUp },
  falling: { label: 'Falling', icon: TrendDown },
  stable: { label: 'Stable', icon: Minus },
};

/**
 * Nationwide movers: 9 products (3 rising, 3 falling, 3 stable over 30 days) that change every
 * minute with a staggered reshuffle. Rotation pauses off-screen, in the background, or when the
 * reader pauses it.
 */
export function MoversList({ products }: { products: ProductSummary[] }) {
  const pools = useMemo(() => highlightPools(products), [products]);
  const pages = pageCount(pools);
  const [paused, setPaused] = useState(false);
  const focused = useIsFocused();
  const page = useRotation(pages, ROTATE_MS, focused && !paused);

  const rows = highlightPage(pools, page);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="section" accessibilityRole="header">
            Nationwide movers
          </Text>
          <Text variant="caption" color={colors.neutral[400]}>
            {paused
              ? 'Paused · 30-day change at the cheapest store'
              : 'Changes every minute · 30-day change at the cheapest store'}
          </Text>
        </View>
        <IconButton
          icon={paused ? Play : Pause}
          size={36}
          iconSize={16}
          accessibilityLabel={paused ? 'Resume movers' : 'Pause movers'}
          onPress={() => setPaused((p) => !p)}
        />
      </View>
      <View>
        {rows.map((h, i) => {
          const k = KIND[h.kind];
          const p = h.product;
          const IconCmp = k.icon;
          return (
            <Animated.View
              key={`${page}-${p.id}`}
              entering={FadeInDown.delay(i * 45).duration(280)}
              exiting={FadeOut.duration(140)}
              layout={LinearTransition.duration(260)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${k.label}: ${p.name} ${p.size}, ${money(p.price)} at ${p.retailer}, 30 days ${formatChange(p.change.d30)}`}
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <ProductAvatar name={p.name} imageUrl={p.imageUrl} size={36} />
                <View style={styles.flex}>
                  <Text numberOfLines={1}>
                    {`${p.name} `}
                    <Text variant="bodySmall" color={colors.neutral[400]}>
                      {p.size}
                    </Text>
                  </Text>
                  <Text variant="caption" numeric color={colors.neutral[400]}>
                    {`${money(p.price)} at ${p.retailer}`}
                  </Text>
                </View>
                <View style={styles.right}>
                  <View style={styles.kind}>
                    <IconCmp
                      size={14}
                      color={h.kind === 'rising' ? colors.accentRamp[300] : colors.neutral[300]}
                    />
                    <Text variant="caption" color={colors.neutral[300]}>
                      {k.label}
                    </Text>
                  </View>
                  <Text numeric color={h.kind === 'rising' ? colors.accentRamp[300] : colors.text}>
                    {formatChange(p.change.d30)}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  pressed: { opacity: 0.7 },
  right: { alignItems: 'flex-end', gap: 2 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
