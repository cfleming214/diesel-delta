import { CameraView, useCameraPermissions } from 'expo-camera';
import { CheckSquare, Square } from 'phosphor-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDate, fromISODate, money, parseReceipt, type ParsedReceipt } from '@/domain';
import { ocr } from '@/lib/ocr';
import { colors, radius } from '@/theme';
import { Button, Card, Text } from '@/ui';

type Props = {
  onAdd: (receipt: ParsedReceipt, selected: number[]) => void;
};

/** Viewfinder → Capture → OCR line list with checkboxes → "Add N prices". */
export function ReceiptCapture({ onAdd }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);

  const capture = async () => {
    setBusy(true);
    try {
      let uri: string | null = null;
      try {
        uri = (await camera.current?.takePictureAsync({ quality: 0.6 }))?.uri ?? null;
      } catch {
        // No camera (simulator, web): the OCR provider still runs.
      }
      const parsed = parseReceipt(await ocr.recognize(uri));
      setReceipt(parsed);
      setSelected(parsed.lines.map(() => true));
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    const count = selected.filter(Boolean).length;
    const header = [receipt.store, receipt.date ? formatDate(fromISODate(receipt.date)) : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <Card gap={12}>
        <View style={styles.head}>
          <Text variant="bodySmall">{header || 'Receipt'}</Text>
          <Text variant="bodySmall" numeric color={colors.neutral[400]}>
            {`${count} of ${receipt.lines.length} lines selected`}
          </Text>
        </View>
        {receipt.lines.length === 0 ? (
          <Text variant="bodySmall" color={colors.neutral[400]}>
            No item prices found. Try again with the receipt flat and well lit.
          </Text>
        ) : null}
        {receipt.lines.map((line, i) => (
          <Pressable
            key={`${line.text}-${i}`}
            accessibilityRole="checkbox"
            aria-checked={selected[i]}
            accessibilityLabel={`${line.text}, ${money(line.price)}`}
            onPress={() => setSelected((s) => s.map((v, j) => (j === i ? !v : v)))}
            style={styles.line}
          >
            {selected[i] ? (
              <CheckSquare size={20} weight="fill" color={colors.accent} />
            ) : (
              <Square size={20} color={colors.accent} />
            )}
            <Text variant="bodySmall" style={styles.lineText}>
              {line.text}
            </Text>
            <Text variant="bodySmall" numeric>
              {money(line.price)}
            </Text>
          </Pressable>
        ))}
        <Button
          label={`Add ${count} ${count === 1 ? 'price' : 'prices'}`}
          block
          disabled={count === 0}
          onPress={() =>
            onAdd(
              receipt,
              selected.flatMap((v, i) => (v ? [i] : [])),
            )
          }
        />
      </Card>
    );
  }

  const granted = permission?.granted ?? false;
  return (
    <Card gap={12}>
      <View style={styles.viewfinder}>
        {granted ? <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" /> : null}
        <View pointerEvents="none" style={styles.frame} />
        <Text variant="caption" color={colors.neutral[400]} style={styles.hint}>
          Hold the receipt flat inside the frame
        </Text>
      </View>
      {granted || !permission?.canAskAgain ? null : (
        <Button label="Allow camera" variant="secondary" block onPress={requestPermission} />
      )}
      <Button
        label={busy ? 'Reading receipt…' : 'Capture'}
        block
        disabled={busy}
        onPress={capture}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    height: 200,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.neutral[900],
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    position: 'absolute',
    top: 18,
    bottom: 18,
    left: 70,
    right: 70,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.neutral[600],
    borderRadius: 6,
  },
  hint: { position: 'absolute', bottom: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  lineText: { flex: 1, fontSize: 14 },
});
