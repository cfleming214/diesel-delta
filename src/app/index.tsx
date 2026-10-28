import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>DieselDelta</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  text: { color: colors.text, fontSize: 20, fontFamily: fonts.medium },
});
