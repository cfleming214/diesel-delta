import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, layout } from '@/theme';

type Props = { color?: string; style?: ViewStyle };

/** Freestanding 1px rule that fades to transparent over 48pt at each end (Nocturne signature). */
export function FadeRule({ color = colors.divider, style }: Props) {
  const [width, setWidth] = useState(0);
  const fade = width > 0 ? Math.min(0.5, layout.ruleFade / width) : 0.25;
  return (
    <View style={[styles.rule, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <LinearGradient
        colors={['transparent', color, color, 'transparent']}
        locations={[0, fade, 1 - fade, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { height: 1, alignSelf: 'stretch' },
});
