import { router, useLocalSearchParams } from 'expo-router';
import { CaretRight, Check, Plus, X } from '@/ui/icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ProductAvatar } from '@/components/ProductAvatar';
import { ProductPriceChart } from '@/components/ProductPriceChart';
import { CHANGE_LABELS, formatChange, RETAILER_STYLE } from '@/components/priceChange';
import { useProduct, type RetailerPriceHistory } from '@/data';
import { dateAtIndex, formatDate, money } from '@/domain';
import { basketIds, usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors } from '@/theme';
import { Button, IconButton, Screen, Seg, Text } from '@/ui';
import { track } from '@/lib/telemetry';

const RANGES = [
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
  { value: 365, label: '1Y' },
] as const;
type Range = (typeof RANGES)[number]['value'];

const rangeWords: Record<Range, string> = { 30: '30 days', 90: '90 days', 365: '1 year' };

/**
 * Product detail, opened from Search like a stock quote: today's price, a full-size chart of every
 * retailer's price over 30 days, 90 days or a year (drag to read any day), and each retailer's
 * own price and changes. Tapping a retailer makes it the headline.
 */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: p, error } = useProduct(id);
  const [range, setRange] = useState<Range>(90);
  const [scrub, setScrub] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const basket = usePrefs((s) => s.basket);
  const inBasket = basketIds(basket).includes(id);

  useEffect(() => {
    track('item_view', { item: id, source: 'product' });
  }, [id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/search'));

  if (!p) {
    return (
      <Screen>
        <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
        <Text color={colors.neutral[400]} style={styles.missing}>
          {error ? 'This product could not be loaded.' : 'Loading…'}
        </Text>
      </Screen>
    );
  }

  const head: RetailerPriceHistory =
    p.retailers.find((r) => r.retailer === selected) ?? p.retailers[0]!;
  const length = range + 1;
  const series = p.retailers.map((r) => ({
    retailer: r.retailer,
    values: r.history.values.slice(-length),
  }));
  const firstIndex = head.history.values.length - length;
  const at = scrub ?? length - 1;
  const date = formatDate(dateAtIndex(head.history.startDate, firstIndex + at));
  const headPrice = head.history.values[firstIndex + at]!;
  const rangeChange = head.change[range === 30 ? 'd30' : range === 90 ? 'd90' : 'd365'];
  const prices = series.flatMap((s) => s.values);

  const toggleBasket = () => {
    const { addToBasket, removeFromBasket } = usePrefs.getState();
    if (inBasket) {
      removeFromBasket(p.id);
      track('basket_remove', { item: p.id, mode: 'product' });
    } else {
      addToBasket(p.id);
      track('basket_add', { item: p.id, source: 'product' });
      toast(`${p.name} added to basket`);
    }
  };

  return (
    <Screen scroll bottomInset={32} contentStyle={styles.content}>
      <View style={styles.top}>
        <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
      </View>

      <View style={styles.header}>
        <ProductAvatar name={p.name} imageUrl={p.imageUrl} size={56} />
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header" style={styles.name}>
            {p.name}
          </Text>
          <Text variant="bodySmall" color={colors.neutral[400]}>
            {`${p.size} · ${p.category}`}
          </Text>
        </View>
      </View>

      <View>
        <Text numeric style={styles.price}>
          {money(headPrice)}
        </Text>
        <Text variant="bodySmall" numeric color={colors.neutral[300]}>
          {scrub == null
            ? `at ${head.retailer} · ${formatChange(rangeChange)} over ${rangeWords[range]}`
            : `at ${head.retailer} on ${date}`}
        </Text>
      </View>

      <Seg
        height={36}
        value={range}
        onChange={(r: Range) => {
          setScrub(null);
          setRange(r);
        }}
        options={RANGES}
        accessibilityLabel="Range"
      />

      <View>
        <ProductPriceChart
          series={series}
          index={scrub}
          onIndexChange={setScrub}
          accessibilityLabel={`${p.name} price over ${rangeWords[range]} at ${p.retailers.length} retailers, ${money(Math.min(...prices))} to ${money(Math.max(...prices))}`}
        />
        <View style={styles.axis}>
          <Text variant="caption" color={colors.neutral[500]} style={styles.axisText}>
            {formatDate(dateAtIndex(head.history.startDate, firstIndex))}
          </Text>
          <Text variant="caption" color={colors.neutral[500]} style={styles.axisText}>
            {scrub == null ? 'Drag to read a day' : date}
          </Text>
          <Text variant="caption" color={colors.neutral[500]} style={styles.axisText}>
            {formatDate(dateAtIndex(head.history.startDate, head.history.values.length - 1))}
          </Text>
        </View>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Headline retailer">
        <Text variant="section" style={styles.sectionTitle}>
          By retailer
        </Text>
        {p.retailers.map((r) => {
          const st = RETAILER_STYLE[r.retailer] ?? { color: colors.accent, dash: '' };
          const price = r.history.values[r.history.values.length - length + at]!;
          const isHead = r.retailer === head.retailer;
          return (
            <Pressable
              key={r.retailer}
              accessibilityRole="radio"
              aria-checked={isHead}
              accessibilityLabel={`${r.retailer}, ${money(price)}, ${CHANGE_LABELS.map(([k, l]) => `${l} ${formatChange(r.change[k])}`).join(', ')}`}
              onPress={() => setSelected(r.retailer)}
              style={({ pressed }) => [
                styles.retailer,
                isHead && styles.retailerOn,
                pressed && styles.pressed,
              ]}
            >
              <Svg width={22} height={8} accessibilityElementsHidden>
                <Line
                  x1={1}
                  y1={4}
                  x2={21}
                  y2={4}
                  stroke={st.color}
                  strokeWidth={2}
                  strokeDasharray={st.dash || undefined}
                  strokeLinecap="round"
                />
              </Svg>
              <View style={styles.flex}>
                <Text>{r.retailer}</Text>
                <View style={styles.changes}>
                  {CHANGE_LABELS.map(([k, label]) => (
                    <Text
                      key={k}
                      variant="caption"
                      numeric
                      color={(r.change[k] ?? 0) > 0 ? colors.accentRamp[300] : colors.neutral[400]}
                    >
                      {`${label} ${formatChange(r.change[k])}`}
                    </Text>
                  ))}
                </View>
              </View>
              <Text numeric>{money(price)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Button
        label={inBasket ? 'In your basket' : 'Add to basket'}
        icon={inBasket ? Check : Plus}
        variant={inBasket ? 'secondary' : 'primary'}
        height={48}
        block
        onPress={toggleBasket}
      />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Price ledger and sources"
        onPress={() => router.push({ pathname: '/item/[id]', params: { id: p.id } })}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={styles.flex}>Price ledger and sources</Text>
        <CaretRight size={16} color={colors.neutral[500]} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  top: { flexDirection: 'row', justifyContent: 'flex-end' },
  missing: { marginTop: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1 },
  name: { fontSize: 24, lineHeight: 30 },
  price: { fontSize: 36, lineHeight: 44 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: 11 },
  sectionTitle: { marginBottom: 4 },
  retailer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  retailerOn: { backgroundColor: colors.surface },
  changes: { flexDirection: 'row', gap: 10 },
  pressed: { opacity: 0.7 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.rowRule,
  },
});
