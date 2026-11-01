import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { Button, Screen, Text } from '@/ui';

/** Any link that doesn't match a screen: says so, and offers a way back in. */
export default function NotFoundScreen() {
  return (
    <Screen contentStyle={styles.content}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.text}>
        <Text variant="title" accessibilityRole="header">
          Page not found
        </Text>
        <Text color={colors.neutral[400]}>
          This link doesn’t go to anything in Diesel Data. It may be old or mistyped.
        </Text>
      </View>
      <Button label="Go to Today" large block onPress={() => router.replace('/')} />
      <Button
        label="Search products"
        variant="secondary"
        large
        block
        onPress={() => router.replace('/search')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, justifyContent: 'center', flexGrow: 1 },
  text: { gap: 8, marginBottom: 8 },
});
