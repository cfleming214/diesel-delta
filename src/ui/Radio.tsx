import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

/** 16pt radio dot: divider ring when off; accent fill with a 4pt ground-colored inset when on. */
export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        selected && {
          borderColor: colors.accent,
          backgroundColor: colors.accent,
          boxShadow: `inset 0 0 0 4px ${colors.bg}`,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.divider },
});
