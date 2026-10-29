import { DotsSixVertical } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { selectionTick } from '@/lib/haptics';
import { colors, shadows } from '@/theme';

type Props<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** Fixed row height; reorder targets are computed from it. */
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  onMove: (from: number, to: number) => void;
  /** Accessible name for an item, used in the drag handle and move actions. */
  labelOf: (item: T) => string;
};

/**
 * Fixed-height list whose rows can be dragged by a trailing handle. Other rows slide out of the way
 * while dragging; dropping commits the move. VoiceOver gets "Move up" and "Move down" actions.
 */
export function ReorderableList<T>({
  items,
  keyOf,
  rowHeight,
  renderRow,
  onMove,
  labelOf,
}: Props<T>) {
  const active = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const count = items.length;

  const commit = (from: number, to: number) => {
    if (from !== to) onMove(from, to);
    // Reset after the store has reordered, so rows land in their new slots without a jump.
    requestAnimationFrame(() => {
      active.set(-1);
      dragY.set(0);
    });
  };

  return (
    <View style={{ height: rowHeight * count }}>
      {items.map((item, index) => (
        <Row
          key={keyOf(item)}
          index={index}
          count={count}
          rowHeight={rowHeight}
          active={active}
          dragY={dragY}
          onCommit={commit}
          label={labelOf(item)}
          onMove={onMove}
        >
          {renderRow(item, index)}
        </Row>
      ))}
    </View>
  );
}

type RowProps = {
  index: number;
  count: number;
  rowHeight: number;
  active: SharedValue<number>;
  dragY: SharedValue<number>;
  onCommit: (from: number, to: number) => void;
  onMove: (from: number, to: number) => void;
  label: string;
  children: ReactNode;
};

function Row({
  index,
  count,
  rowHeight,
  active,
  dragY,
  onCommit,
  onMove,
  label,
  children,
}: RowProps) {
  const style = useAnimatedStyle(() => {
    const a = active.get();
    let shift = 0;
    if (a === index) {
      return {
        top: index * rowHeight,
        zIndex: 10,
        transform: [{ translateY: dragY.get() }],
        ...shadows.md,
      };
    }
    if (a >= 0) {
      const target = Math.min(count - 1, Math.max(0, Math.round(a + dragY.get() / rowHeight)));
      if (a < index && index <= target) shift = -rowHeight;
      else if (target <= index && index < a) shift = rowHeight;
    }
    return {
      top: index * rowHeight,
      zIndex: 0,
      transform: [{ translateY: withTiming(shift, { duration: 140 }) }],
      boxShadow: 'none',
    };
  });

  const pan = Gesture.Pan()
    .withTestId(`reorder-${index}`)
    .minDistance(0)
    .onBegin(() => {
      active.set(index);
      dragY.set(0);
      scheduleOnRN(selectionTick);
    })
    .onUpdate((e) => {
      const min = -index * rowHeight;
      const max = (count - 1 - index) * rowHeight;
      dragY.set(Math.min(max, Math.max(min, e.translationY)));
    })
    .onFinalize(() => {
      const target = Math.min(count - 1, Math.max(0, Math.round(index + dragY.get() / rowHeight)));
      scheduleOnRN(onCommit, index, target);
    });

  return (
    <Animated.View
      style={[styles.row, { height: rowHeight }, style]}
      accessibilityActions={[
        { name: 'moveUp', label: 'Move up' },
        { name: 'moveDown', label: 'Move down' },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'moveUp' && index > 0) onMove(index, index - 1);
        if (e.nativeEvent.actionName === 'moveDown' && index < count - 1) onMove(index, index + 1);
      }}
    >
      <View style={styles.content}>{children}</View>
      <GestureDetector gesture={pan}>
        <View
          style={styles.handle}
          accessibilityRole="button"
          accessibilityLabel={`Reorder ${label}`}
          accessibilityHint="Drag up or down"
        >
          <DotsSixVertical size={20} color={colors.neutral[400]} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  // Clip so the row's 1px bottom rule is not covered by the (opaque) row content.
  content: { flex: 1, minWidth: 0, alignSelf: 'stretch', overflow: 'hidden' },
  handle: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
});
