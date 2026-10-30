import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { selectionTick } from '@/lib/haptics';
import { colors, glow } from '@/theme';

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  /** Spoken value, e.g. "3 weeks". */
  accessibilityValueText?: string;
  testID?: string;
};

const THUMB = 22;

/** Whole-step slider with an accent thumb. Tap or drag to set; a haptic tick marks each step. */
export function Slider({
  value,
  min,
  max,
  onChange,
  accessibilityLabel,
  accessibilityValueText,
  testID,
}: Props) {
  const [width, setWidth] = useState(0);
  const last = useSharedValue(value);
  const track = Math.max(1, width - THUMB);
  const steps = max - min;

  const commit = (v: number) => {
    selectionTick();
    onChange(v);
  };

  const pick = (x: number) => {
    'worklet';
    const frac = Math.min(1, Math.max(0, (x - THUMB / 2) / track));
    const v = min + Math.round(frac * steps);
    if (v !== last.value) {
      last.value = v;
      scheduleOnRN(commit, v);
    }
  };

  const gesture = Gesture.Pan()
    .withTestId(testID ? `${testID}-pan` : 'slider-pan')
    .minDistance(0)
    .failOffsetY([-12, 12])
    .onBegin((e) => {
      last.value = value;
      pick(e.x);
    })
    .onUpdate((e) => pick(e.x));

  const frac = steps > 0 ? (value - min) / steps : 0;
  const thumbLeft = frac * track;

  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        style={styles.root}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={accessibilityValueText}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = value + (e.nativeEvent.actionName === 'increment' ? 1 : -1);
          if (next >= min && next <= max) commit(next);
        }}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: thumbLeft + THUMB / 2 }]} />
        </View>
        <View style={[styles.thumb, { left: thumbLeft }]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { height: 28, justifyContent: 'center' },
  track: {
    height: 4,
    borderRadius: 2,
    marginHorizontal: THUMB / 2,
    backgroundColor: colors.neutral[800],
    overflow: 'hidden',
  },
  fill: { height: 4, marginLeft: -THUMB / 2, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.accentRamp[200],
    ...glow(8, 0.6),
  },
});
