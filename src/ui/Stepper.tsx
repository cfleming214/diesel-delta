import { Minus, Plus } from '@/ui/icons';
import { Platform, StyleSheet, View } from 'react-native';

import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Formats the value label, e.g. `3 pts`. */
  format?: (value: number) => string;
  accessibilityLabel: string;
};

/** −/+ stepper with 36pt secondary icon buttons (Delta tolerance, 1–15). */
export function Stepper({ value, onChange, min, max, format = String, accessibilityLabel }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <View
      style={styles.row}
      // Native: one adjustable element (swipe up/down). Web has no adjustable, and buttons nested in a
      // slider are invalid ARIA, so it gets a labelled group with the two buttons.
      {...(Platform.OS === 'web'
        ? { role: 'group' as const, 'aria-label': accessibilityLabel }
        : {
            accessible: true,
            accessibilityRole: 'adjustable' as const,
            accessibilityLabel,
            accessibilityValue: { min, max, now: value, text: format(value) },
            accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
            onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
              if (e.nativeEvent.actionName === 'increment') onChange(clamp(value + 1));
              if (e.nativeEvent.actionName === 'decrement') onChange(clamp(value - 1));
            },
          })}
    >
      <IconButton
        icon={Minus}
        size={36}
        iconSize={16}
        accessibilityLabel="Decrease"
        onPress={() => onChange(clamp(value - 1))}
      />
      <Text variant="control" numeric style={styles.value}>
        {format(value)}
      </Text>
      <IconButton
        icon={Plus}
        size={36}
        iconSize={16}
        accessibilityLabel="Increase"
        onPress={() => onChange(clamp(value + 1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { minWidth: 48, textAlign: 'center' },
});
