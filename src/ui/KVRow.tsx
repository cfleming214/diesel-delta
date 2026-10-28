import { StyleSheet, View } from 'react-native';

import { colors, em, fonts } from '@/theme';

import { Text } from './Text';

/** Sheet key/value row: 11pt uppercase neutral-400 key over a 14/1.5 neutral-200 value. */
export function KVRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text color={colors.neutral[400]} style={styles.key}>
        {k}
      </Text>
      <Text color={colors.neutral[200]} style={styles.value}>
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 10 },
  key: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: em(0.08, 11),
    textTransform: 'uppercase',
  },
  value: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
});
