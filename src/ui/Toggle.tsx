import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

type Props = { value: boolean; onChange: (value: boolean) => void; accessibilityLabel: string };

/** 46×28 switch. On: accent-800 track, accent border, accent-300 knob. Off: neutral-900, neutral-600 knob. */
export function Toggle({ value, onChange, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={[
        styles.track,
        value
          ? {
              backgroundColor: colors.accentRamp[800],
              borderColor: colors.accent,
              justifyContent: 'flex-end',
            }
          : {
              backgroundColor: colors.neutral[900],
              borderColor: colors.divider,
              justifyContent: 'flex-start',
            },
      ]}
    >
      <View
        style={[
          styles.knob,
          { backgroundColor: value ? colors.accentRamp[300] : colors.neutral[600] },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  knob: { width: 22, height: 22, borderRadius: 11 },
});
