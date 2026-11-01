import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { Button, Text } from '@/ui';

type Props = {
  /** What couldn't be loaded, in plain words, e.g. "Prices could not be loaded." */
  message: string;
  onRetry: () => void;
};

/** A failed load: what happened, and a Retry button that fetches again. */
export function LoadError({ message, onRetry }: Props) {
  return (
    <View style={styles.root} accessibilityRole="alert">
      <Text color={colors.neutral[400]}>{`${message} Check your connection and try again.`}</Text>
      <Button label="Retry" variant="secondary" onPress={onRetry} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'flex-start' },
  button: { minWidth: 120 },
});
