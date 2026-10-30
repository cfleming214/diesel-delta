import { MinusCircle } from '@/ui/icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { colors } from '@/theme';
import { Text } from '@/ui';

type Props = { children: ReactNode; onRemove: () => void; label: string };

const ACTION_WIDTH = 88;

/** Swipe a row left to reveal a Remove action. */
export function SwipeToRemove({ children, onRemove, label }: Props) {
  return (
    <Swipeable
      friction={1.6}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          style={styles.action}
        >
          <MinusCircle size={18} color={colors.accentRamp[300]} />
          <Text variant="caption" color={colors.accentRamp[100]}>
            Remove
          </Text>
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.accentRamp[800],
  },
});
