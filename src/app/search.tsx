import { router } from 'expo-router';
import { Barcode, Check, Link, MagnifyingGlass, Plus } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { SEARCH_SUGGESTIONS, useBarcodeLookup, useCatalogSearch, type CatalogItem } from '@/data';
import { money, VERDICTS } from '@/domain';
import { selectionTick } from '@/lib/haptics';
import { basketIds, usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors } from '@/theme';
import { Button, IconButton, Input, Screen, Tag, Text } from '@/ui';
import { track } from '@/lib/telemetry';

/** Synthetic code the dev-only "Simulate a scan" button feeds in (Heinz ketchup 32 oz fixture). */
const DEV_SCAN_CODE = '0000000000017';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const basket = usePrefs((s) => s.basket);
  const { addToBasket, removeFromBasket } = usePrefs.getState();
  const lookupBarcode = useBarcodeLookup();
  const search = useCatalogSearch(query);

  const inBasket = new Set(basketIds(basket));

  // One search event per settled query (debounced), with the outcome only, not the text.
  const settledCount = search.data && query.trim() ? search.data.items.length : null;
  const fromLink = search.data?.resolvedFromLink ?? false;
  useEffect(() => {
    if (settledCount == null) return;
    const t = setTimeout(() => track('search', { results: settledCount, link: fromLink }), 1000);
    return () => clearTimeout(t);
  }, [settledCount, fromLink, query]);
  const q = query.trim();
  const results = q ? (search.data?.items ?? []) : [];

  const onScanned = async (code: string) => {
    selectionTick();
    const item = await lookupBarcode(code);
    setScanning(false);
    track('barcode_scan', { matched: item != null });
    if (item) {
      setScanMiss(null);
      setQuery(`${item.name} ${item.size}`);
    } else {
      setScanMiss(code);
    }
  };

  const toggle = (item: CatalogItem) => {
    if (inBasket.has(item.id)) {
      removeFromBasket(item.id);
      track('basket_remove', { item: item.id, mode: 'search' });
    } else {
      addToBasket(item.id);
      track('basket_add', { item: item.id, source: 'search' });
      toast(`${item.name} added to basket`);
    }
  };

  return (
    <Screen scroll bottomInset={24} contentStyle={styles.content}>
      <View style={styles.top}>
        <BackButton />
        <Input
          style={styles.input}
          icon={MagnifyingGlass}
          placeholder="Item, barcode or product link"
          accessibilityLabel="Search items"
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setScanning(false);
            setScanMiss(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <IconButton
          icon={Barcode}
          variant="primary"
          accessibilityLabel={scanning ? 'Close scanner' : 'Scan a barcode'}
          onPress={() => {
            setScanMiss(null);
            setScanning((s) => !s);
          }}
        />
      </View>

      {scanning ? (
        <View style={styles.block}>
          <BarcodeScanner onScanned={onScanned} />
          <Text variant="bodySmall" color={colors.neutral[300]} style={styles.body14}>
            Point the camera at a UPC or EAN barcode.
          </Text>
          {__DEV__ ? (
            <Button
              label="Simulate a scan"
              variant="secondary"
              block
              onPress={() => onScanned(DEV_SCAN_CODE)}
            />
          ) : null}
        </View>
      ) : null}

      {scanMiss ? (
        <Text variant="bodySmall" color={colors.neutral[400]} style={styles.body14}>
          {`No tracked item matches barcode ${scanMiss}.`}
        </Text>
      ) : null}

      {!q && !scanning ? (
        <View style={styles.suggest}>
          <Text variant="bodySmall" color={colors.neutral[400]}>
            Type what&apos;s in your cart, scan a barcode, or paste a retailer link.
          </Text>
          <View style={styles.chips}>
            {SEARCH_SUGGESTIONS.map((s) => (
              <Button
                key={s}
                label={s.startsWith('http') ? 'Paste a link' : s}
                variant="secondary"
                height={36}
                onPress={() => setQuery(s)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {q && search.data?.resolvedFromLink ? (
        <View style={styles.resolved}>
          <Link size={14} color={colors.accentRamp[300]} />
          <Text variant="caption" color={colors.accentRamp[300]}>
            Resolved from retailer link
          </Text>
        </View>
      ) : null}

      <View>
        {results.map((item) => {
          const added = inBasket.has(item.id);
          const verdict = VERDICTS[item.verdict];
          return (
            <View key={item.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name} ${item.size}, ${verdict.label}, ${money(item.price)} at ${item.store}`}
                style={styles.rowMain}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              >
                <Text>
                  {`${item.name} `}
                  <Text variant="bodySmall" color={colors.neutral[400]}>
                    {item.size}
                  </Text>
                </Text>
                <View style={styles.meta}>
                  <Tag label={verdict.label} tone={verdict.tone} size="sm" />
                  <Text variant="caption" numeric color={colors.neutral[400]}>
                    {`${money(item.price)} at ${item.store}`}
                  </Text>
                </View>
              </Pressable>
              <Button
                label={added ? 'Added' : 'Add'}
                icon={added ? Check : Plus}
                variant="secondary"
                height={36}
                color={added ? colors.accent : undefined}
                onPress={() => toggle(item)}
              />
            </View>
          );
        })}
        {q && search.data && results.length === 0 ? (
          <Text color={colors.neutral[400]} style={styles.empty}>
            {`No tracked item matches “${q}”.`}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1 },
  block: { gap: 12 },
  body14: { fontSize: 14 },
  suggest: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resolved: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 4, paddingVertical: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { paddingVertical: 24, fontSize: 14 },
});
