import { MinusCircle, Star } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import type { ItemDetail } from '@/data';
import { money, sgn, VERDICTS } from '@/domain';
import { colors } from '@/theme';
import { Tag, Text } from '@/ui';

import { Sparkline } from './Sparkline';

type Props = {
  item: ItemDetail;
  followed: boolean;
  editing?: boolean;
  onOpen: () => void;
  onToggleFollow: () => void;
  onRemove?: () => void;
  /** Draw the bottom rule (off when a container draws it across extra controls). */
  divider?: boolean;
};

/** 64pt basket row: name/size, verdict tag and store, sparkline, price and 12-month change, star. */
export function BasketItemRow({
  item,
  followed,
  editing = false,
  onOpen,
  onToggleFollow,
  onRemove,
  divider = true,
}: Props) {
  const verdict = VERDICTS[item.verdict];
  const title = `${item.name} · ${item.size}`;
  return (
    <View style={[styles.row, divider && styles.divider]}>
      {editing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name}`}
          onPress={onRemove}
          style={styles.remove}
        >
          <MinusCircle size={22} color={colors.accentRamp[300]} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${verdict.label}, ${money(item.price)}, ${sgn(item.changePct)}% over 12 months`}
        onPress={onOpen}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <View style={styles.names}>
          <Text numberOfLines={1}>{title}</Text>
          <View style={styles.meta}>
            <Tag label={verdict.label} tone={verdict.tone} size="sm" />
            <Text
              variant="caption"
              color={colors.neutral[400]}
              numberOfLines={1}
              style={styles.store}
            >
              {item.store}
            </Text>
          </View>
        </View>
        {editing ? null : (
          <Sparkline
            values={item.spark}
            width={56}
            height={22}
            color={item.verdict === 'gouge' ? colors.accent : colors.neutral[400]}
          />
        )}
        <View style={styles.price}>
          <Text numeric>{money(item.price)}</Text>
          <Text variant="caption" numeric color={colors.neutral[400]}>
            {`${sgn(item.changePct)}%`}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={followed ? `Unfollow ${item.name}` : `Follow ${item.name}`}
        aria-selected={followed}
        onPress={onToggleFollow}
        style={styles.star}
      >
        <Star
          size={18}
          weight={followed ? 'fill' : 'regular'}
          color={followed ? colors.accent : colors.neutral[500]}
        />
      </Pressable>
    </View>
  );
}

export const BASKET_ROW_HEIGHT = 64;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: BASKET_ROW_HEIGHT,
    backgroundColor: colors.bg,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.rowRule },
  remove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: 0.7 },
  names: { flex: 1, minWidth: 0, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' },
  store: { flexShrink: 1 },
  price: { width: 62, alignItems: 'flex-end', gap: 2 },
  star: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
