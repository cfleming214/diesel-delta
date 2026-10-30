import { Camera, PencilSimple } from 'phosphor-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ReceiptCapture } from '@/components/ReceiptCapture';
import { TAB_BAR_CLEARANCE } from '@/components/TabBar';
import { STORES, useCatalog } from '@/data';
import {
  compareToListed,
  formatDate,
  fromISODate,
  listedPriceFor,
  money,
  toISODate,
  type ParsedReceipt,
} from '@/domain';
import { useReceipts } from '@/store/receipts';
import { toast } from '@/store/toast';
import { alpha, colors } from '@/theme';
import { Button, Card, Input, Screen, Text } from '@/ui';

type Mode = 'camera' | 'manual' | null;

export default function LogScreen() {
  const [mode, setMode] = useState<Mode>(null);
  const history = useReceipts((s) => s.history);
  const add = useReceipts((s) => s.add);
  const catalog = useCatalog().data ?? [];

  const addFromReceipt = (receipt: ParsedReceipt, selected: number[]) => {
    const date = receipt.date ?? toISODate(new Date());
    const store = receipt.store ?? 'Unknown store';
    add(
      selected.map((i) => {
        const line = receipt.lines[i]!;
        const cmp = compareToListed(line.price, listedPriceFor(line, catalog));
        return {
          item: line.text,
          price: line.price,
          store,
          date,
          comparison: cmp.text,
          differs: cmp.differs,
        };
      }),
    );
    setMode(null);
    toast(`${selected.length} ${selected.length === 1 ? 'price' : 'prices'} added`);
  };

  return (
    <Screen scroll bottomInset={TAB_BAR_CLEARANCE} contentStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          Log
        </Text>
        <Text variant="caption" color={colors.neutral[400]}>
          Private to this device
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Scan receipt"
          icon={Camera}
          height={48}
          style={styles.action}
          onPress={() => setMode((m) => (m === 'camera' ? null : 'camera'))}
        />
        <Button
          label="Enter manually"
          icon={PencilSimple}
          variant="secondary"
          height={48}
          style={styles.action}
          onPress={() => setMode((m) => (m === 'manual' ? null : 'manual'))}
        />
      </View>

      {mode === 'camera' ? <ReceiptCapture onAdd={addFromReceipt} /> : null}
      {mode === 'manual' ? (
        <ManualEntry
          catalog={catalog}
          onSave={(entry) => {
            add([entry]);
            setMode(null);
            toast('Price saved');
          }}
        />
      ) : null}

      <View>
        <Text variant="section" style={styles.historyTitle}>
          History
        </Text>
        {history.length === 0 ? (
          <Text variant="bodySmall" color={colors.neutral[400]}>
            No prices logged yet. Scan a receipt or enter a price to build your own price history.
          </Text>
        ) : null}
        {history.map((h) => (
          <View key={h.id} style={styles.row}>
            <View style={styles.rowLine}>
              <Text style={styles.flex} numberOfLines={1}>
                {h.item}
              </Text>
              <Text numeric>{money(h.price)}</Text>
            </View>
            <View style={styles.rowLine}>
              <Text variant="caption" color={colors.neutral[400]}>
                {`${h.store} · ${formatDate(fromISODate(h.date))}`}
              </Text>
              <Text
                variant="caption"
                color={h.differs ? colors.accentRamp[300] : colors.neutral[400]}
              >
                {h.comparison}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

type Entry = Parameters<ReturnType<typeof useReceipts.getState>['add']>[0][number];

function ManualEntry({
  catalog,
  onSave,
}: {
  catalog: { name: string; size: string; price: number }[];
  onSave: (entry: Entry) => void;
}) {
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const [store, setStore] = useState<string>(STORES[0]!);
  const [errors, setErrors] = useState<{ item?: boolean; price?: boolean }>({});
  const value = useMemo(() => Number.parseFloat(price), [price]);

  const save = () => {
    const errs = { item: !item.trim(), price: !(value > 0) };
    setErrors(errs);
    if (errs.item || errs.price) return;
    const line = { text: item.trim(), price: value };
    const cmp = compareToListed(value, listedPriceFor(line, catalog));
    onSave({
      item: line.text,
      price: value,
      store,
      date: toISODate(new Date()),
      comparison: cmp.text,
      differs: cmp.differs,
    });
  };

  return (
    <Card gap={12}>
      <Field label="Item" error={errors.item ? 'Enter an item name.' : undefined}>
        <Input
          accessibilityLabel="Item"
          placeholder="e.g. Whole milk 1 gal"
          value={item}
          onChangeText={setItem}
          invalid={errors.item}
        />
      </Field>
      <Field label="Price paid" error={errors.price ? 'Enter a price above $0.' : undefined}>
        <Input
          accessibilityLabel="Price paid"
          placeholder="0.00"
          keyboardType="decimal-pad"
          numeric
          value={price}
          onChangeText={(t) => setPrice(t.replace(/[^\d.]/g, ''))}
          invalid={errors.price}
        />
      </Field>
      <Field label="Store">
        <View style={styles.stores} accessibilityRole="radiogroup">
          {STORES.map((s) => (
            <Button
              key={s}
              label={s}
              variant="secondary"
              height={36}
              color={s === store ? colors.accent : undefined}
              style={s === store ? styles.storeOn : undefined}
              onPress={() => setStore(s)}
            />
          ))}
        </View>
      </Field>
      <Button label="Save price" block onPress={save} />
    </Card>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="caption" color={alpha(colors.text, 0.7)}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text variant="caption" color={colors.accentRamp[300]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  historyTitle: { marginBottom: 4 },
  row: { gap: 2, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.rowRule },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  flex: { flex: 1 },
  field: { gap: 5 },
  stores: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storeOn: { borderColor: colors.accent },
});
