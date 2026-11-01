import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { Text } from '@/ui';

type Props = { name: string; imageUrl: string | null; size?: number };

/**
 * A product's picture: the retailer listing photo when one is known, otherwise the product's
 * initials on a neutral disc (also used if the photo fails to load).
 */
export function ProductAvatar({ name, imageUrl, size = 44 }: Props) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (imageUrl && !failed) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.image, box]}
        accessibilityIgnoresInvertColors
        onError={() => setFailed(true)}
      />
    );
  }
  const initials = name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View style={[styles.disc, box]} importantForAccessibility="no-hide-descendants">
      <Text color={colors.accentRamp[200]} style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.neutral[100] },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentRamp[900],
    borderWidth: 1,
    borderColor: colors.accentRamp[800],
  },
});
