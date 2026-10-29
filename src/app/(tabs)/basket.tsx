import { router } from 'expo-router';
import { Plus } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BASKET_ROW_HEIGHT, BasketItemRow } from '@/components/BasketItemRow';
import { BasketDeltaCard } from '@/components/BasketDeltaCard';
import { ReorderableList } from '@/components/ReorderableList';
import { SwipeToRemove } from '@/components/SwipeToRemove';
import { TAB_BAR_CLEARANCE } from '@/components/TabBar';
import { useBasketSeries, useFuelSeries, useItems, type ItemDetail } from '@/data';
import { basketAttribution, baselineIndex } from '@/domain';
import { basketIds, usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { useUi } from '@/store/ui';
import { colors } from '@/theme';
import { Button, Card, IconButton, Screen, ScreenHeader, Text } from '@/ui';

export default function BasketScreen() {
  const region = usePrefs((s) => s.region);
  const basket = usePrefs((s) => s.basket);
  const followed = usePrefs((s) => s.followed);
  const { removeFromBasket, moveBasketItem, toggleFollow } = usePrefs.getState();
  const baseline = useUi((s) => s.basketBaseline);
  const setBaseline = useUi((s) => s.setBasketBaseline);
  const [editing, setEditing] = useState(false);

  const ids = useMemo(() => basketIds(basket), [basket]);
  const items = useItems(ids, region);
  const fuel = useFuelSeries(region);
  const basketSeries = useBasketSeries(ids);

  const attribution = useMemo(() => {
    if (!fuel.data || !basketSeries.data || ids.length === 0) return null;
    const values = basketSeries.data.values;
    return basketAttribution(values, fuel.data.values, baselineIndex(values.length, baseline));
  }, [fuel.data, basketSeries.data, baseline, ids.length]);

  const loaded = items.filter((i): i is ItemDetail => i != null);
  const open = (id: string) => router.push({ pathname: '/item/[id]', params: { id } });
  const remove = (item: ItemDetail) => {
    removeFromBasket(item.id);
    toast(`${item.name} removed`);
  };

  const row = (item: ItemDetail, rowEditing: boolean) => (
    <BasketItemRow
      item={item}
      followed={followed.includes(item.id)}
      editing={rowEditing}
      divider={!rowEditing}
      onOpen={() => open(item.id)}
      onToggleFollow={() => toggleFollow(item.id)}
      onRemove={() => remove(item)}
    />
  );

  return (
    <Screen scroll bottomInset={TAB_BAR_CLEARANCE} contentStyle={styles.content}>
      <ScreenHeader
        title="Basket"
        subtitle={`${ids.length} ${ids.length === 1 ? 'item' : 'items'} · weighted by purchase frequency`}
        right={
          <>
            <Button
              label={editing ? 'Done' : 'Edit'}
              variant="secondary"
              style={styles.editButton}
              onPress={() => setEditing((e) => !e)}
            />
            <IconButton
              icon={Plus}
              variant="primary"
              accessibilityLabel="Add item"
              onPress={() => router.push('/search')}
            />
          </>
        }
      />

      {attribution ? (
        <BasketDeltaCard
          attribution={attribution}
          baseline={baseline}
          onBaselineChange={setBaseline}
        />
      ) : null}

      {ids.length === 0 ? (
        <Card>
          <Text variant="bodySmall" color={colors.neutral[400]}>
            Your basket is empty. Add the items you buy with the + button.
          </Text>
        </Card>
      ) : editing ? (
        <ReorderableList
          items={loaded}
          keyOf={(i) => i.id}
          labelOf={(i) => i.name}
          rowHeight={BASKET_ROW_HEIGHT}
          onMove={moveBasketItem}
          renderRow={(item) => row(item, true)}
        />
      ) : (
        <View>
          {loaded.map((item) => (
            <SwipeToRemove key={item.id} label={item.name} onRemove={() => remove(item)}>
              {row(item, false)}
            </SwipeToRemove>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  // Fixed width so swapping Edit/Done does not reflow the subtitle.
  editButton: { width: 50, paddingHorizontal: 0 },
});
