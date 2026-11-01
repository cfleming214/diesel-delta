import { Check, Plus } from '@/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ProductSummary } from '@/data';
import { money } from '@/domain';
import { colors } from '@/theme';
import { IconButton, Text } from '@/ui';

import { ProductAvatar } from './ProductAvatar';
import { CHANGE_LABELS, describeChange, formatChange } from './priceChange';

type Props = {
  product: ProductSummary;
  inBasket: boolean;
  onPress: () => void;
  onToggleBasket: () => void;
};

/**
 * Search result: picture, name and size, the cheapest retailer's price, its 30-day, 90-day and
 * 1-year change, and a + / check button for the basket.
 */
export function ProductRow({ product: p, inBasket, onPress, onToggleBasket }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${p.name} ${p.size}, ${money(p.price)} at ${p.retailer}, ${describeChange(p.change)}`}
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <ProductAvatar name={p.name} imageUrl={p.imageUrl} />
        <View style={styles.text}>
          <Text numberOfLines={1}>
            {`${p.name} `}
            <Text variant="bodySmall" color={colors.neutral[400]}>
              {p.size}
            </Text>
          </Text>
          <Text variant="bodySmall" numeric color={colors.neutral[300]}>
            {`${money(p.price)} at ${p.retailer}`}
          </Text>
          <View style={styles.changes}>
            {CHANGE_LABELS.map(([k, label]) => {
              const v = p.change[k];
              return (
                <Text
                  key={k}
                  variant="caption"
                  numeric
                  color={v != null && v > 0 ? colors.accentRamp[300] : colors.neutral[400]}
                >
                  {`${label} ${formatChange(v)}`}
                </Text>
              );
            })}
          </View>
        </View>
      </Pressable>
      <IconButton
        icon={inBasket ? Check : Plus}
        variant={inBasket ? 'primary' : 'secondary'}
        accessibilityLabel={inBasket ? `Remove ${p.name} from basket` : `Add ${p.name} to basket`}
        onPress={onToggleBasket}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.7 },
  text: { flex: 1, gap: 2 },
  changes: { flexDirection: 'row', gap: 10 },
});
