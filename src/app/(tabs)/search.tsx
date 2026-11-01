import { router } from 'expo-router';
import { Barcode, Link, MagnifyingGlass } from '@/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { BarcodeScanner } from '@/components/BarcodeScanner';
import { ProductRow } from '@/components/ProductRow';
import { TAB_BAR_CLEARANCE } from '@/components/TabBar';
import {
  SEARCH_PAGE_SIZE,
  SEARCH_SUGGESTIONS,
  searchSuggestions,
  useBarcodeLookup,
  filterProducts,
  useCatalogSearch,
  useProducts,
  type ProductSummary,
} from '@/data';
import { selectionTick } from '@/lib/haptics';
import { basketIds, usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors } from '@/theme';
import { Button, IconButton, Input, Screen, Text } from '@/ui';
import { track } from '@/lib/telemetry';

/** Synthetic code the dev-only "Simulate a scan" button feeds in (Heinz ketchup 32 oz fixture). */
const DEV_SCAN_CODE = '0000000000017';
const LINK = /https?:|www\.|\.com/i;

/**
 * Search tab: every tracked product, filtered as you type (or by barcode, or a pasted retailer
 * link), with auto-fill suggestions while typing. Results load 20 at a time as you scroll. Each
 * row shows the cheapest price, its 30-day, 90-day and 1-year change and a basket button; tapping
 * a row opens the product's price history.
 */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  /** True once a suggestion is picked or the search submitted, until the text changes again. */
  const [committed, setCommitted] = useState(false);
  /** Pages of results shown. */
  const [pages, setPages] = useState(1);
  const basket = usePrefs((s) => s.basket);
  const lookupBarcode = useBarcodeLookup();
  const products = useProducts().data;
  const q = query.trim();
  const isLink = LINK.test(q);
  // Pasted links resolve through the catalog's link resolver; words filter the product list.
  const linkSearch = useCatalogSearch(isLink ? q : '');

  const inBasket = new Set(basketIds(basket));
  const results = useMemo(() => {
    if (!products) return [];
    if (isLink) {
      const ids = new Set(linkSearch.data?.items.map((i) => i.id) ?? []);
      return products.filter((p) => ids.has(p.id));
    }
    return filterProducts(products, q);
  }, [products, q, isLink, linkSearch.data]);

  const suggestions =
    products && !committed && !isLink && !scanning ? searchSuggestions(products, q) : [];
  const shown = results.slice(0, pages * SEARCH_PAGE_SIZE);
  const hasMore = shown.length < results.length;
  const showMore = () => {
    if (hasMore) setPages((n) => n + 1);
  };

  /** Fills the box with a query and runs it (chips, suggestions, scans). */
  const fill = (text: string) => {
    setQuery(text);
    setCommitted(true);
    setPages(1);
  };

  // One search event per settled query (debounced), with the outcome only, not the text.
  const settled = q && products ? results.length : null;
  useEffect(() => {
    if (settled == null) return;
    const t = setTimeout(() => track('search', { results: settled, link: isLink }), 1000);
    return () => clearTimeout(t);
  }, [settled, isLink, q]);

  const onScanned = async (code: string) => {
    selectionTick();
    const item = await lookupBarcode(code);
    setScanning(false);
    track('barcode_scan', { matched: item != null });
    if (item) {
      setScanMiss(null);
      fill(`${item.name} ${item.size}`);
    } else {
      setScanMiss(code);
    }
  };

  const toggle = (p: ProductSummary) => {
    const { addToBasket, removeFromBasket } = usePrefs.getState();
    if (inBasket.has(p.id)) {
      removeFromBasket(p.id);
      track('basket_remove', { item: p.id, mode: 'search' });
    } else {
      addToBasket(p.id);
      track('basket_add', { item: p.id, source: 'search' });
      toast(`${p.name} added to basket`);
    }
  };

  const header = (
    <View style={styles.header}>
      <Text variant="title" accessibilityRole="header">
        Search
      </Text>
      <View style={styles.top}>
        <Input
          style={styles.input}
          icon={MagnifyingGlass}
          placeholder="Item, barcode or product link"
          accessibilityLabel="Search items"
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setCommitted(false);
            setPages(1);
            setScanning(false);
            setScanMiss(null);
          }}
          onSubmitEditing={() => setCommitted(true)}
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

      {suggestions.length ? (
        <View style={styles.suggestions} accessibilityLabel="Suggestions">
          {suggestions.map((sg) => (
            <Pressable
              key={`${sg.kind}:${sg.text}`}
              accessibilityRole="button"
              accessibilityLabel={`Suggestion: ${sg.text}, ${sg.kind === 'category' ? 'category, ' : ''}${sg.count} ${sg.count === 1 ? 'product' : 'products'}`}
              onPress={() => fill(sg.text)}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
            >
              <MagnifyingGlass size={16} color={colors.neutral[400]} />
              <Highlighted text={sg.text} query={q} />
              <Text variant="caption" color={colors.neutral[400]}>
                {sg.kind === 'category' ? `Category · ${sg.count}` : String(sg.count)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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
        <View style={styles.chips}>
          {SEARCH_SUGGESTIONS.map((s) => (
            <Button
              key={s}
              label={s.startsWith('http') ? 'Paste a link' : s}
              variant="secondary"
              height={34}
              onPress={() => fill(s)}
            />
          ))}
        </View>
      ) : null}

      {isLink && results.length ? (
        <View style={styles.resolved}>
          <Link size={14} color={colors.accentRamp[300]} />
          <Text variant="caption" color={colors.accentRamp[300]}>
            Resolved from retailer link
          </Text>
        </View>
      ) : null}

      {products ? (
        <Text variant="caption" color={colors.neutral[400]}>
          {q
            ? `${results.length} ${results.length === 1 ? 'product' : 'products'}`
            : `All ${products.length} products · cheapest price · 30D, 90D and 1Y change`}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            inBasket={inBasket.has(item.id)}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
            onToggleBasket={() => toggle(item)}
          />
        )}
        onEndReached={showMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          results.length > SEARCH_PAGE_SIZE ? (
            <View style={styles.footer}>
              <Text variant="caption" numeric color={colors.neutral[400]}>
                {hasMore
                  ? `Showing ${shown.length} of ${results.length}`
                  : `Showing all ${results.length}`}
              </Text>
              {hasMore ? (
                <Button label="Show more" variant="secondary" height={36} onPress={showMore} />
              ) : null}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          q && products && (!isLink || linkSearch.data) ? (
            <Text color={colors.neutral[400]} style={styles.empty}>
              {`No tracked item matches “${q}”.`}
            </Text>
          ) : undefined
        }
      />
    </Screen>
  );
}

/** The suggestion text with the typed part in the accent color. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0 || !query) return <Text style={styles.flex}>{text}</Text>;
  return (
    <Text style={styles.flex} numberOfLines={1}>
      {text.slice(0, i)}
      <Text color={colors.accentRamp[300]}>{text.slice(i, i + query.length)}</Text>
      {text.slice(i + query.length)}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingBottom: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1 },
  block: { gap: 12 },
  body14: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resolved: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { paddingVertical: 24, fontSize: 14 },
  flex: { flex: 1 },
  suggestions: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  pressed: { opacity: 0.7 },
  footer: { alignItems: 'center', gap: 8, paddingVertical: 16 },
});
