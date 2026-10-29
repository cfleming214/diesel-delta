import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { GasPump, MapPin } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { api, queryKeys, useZipLookup, ZIP_ERROR, type ZipLookup } from '@/data';
import { formatDate, fromISODate, money } from '@/domain';
import { usePrefs } from '@/store/prefs';
import { alpha, colors, em, layout } from '@/theme';
import { Button, Card, Input, Kicker, Screen, Text } from '@/ui';

/** Which EIA diesel series the ZIP uses. EIA publishes state-level diesel only for California. */
function seriesLine(found: ZipLookup) {
  const s = found.dieselSeries;
  if (s.level === 'state') return `State series: ${s.name} retail diesel`;
  return `${found.state.name} has no state diesel series; using ${s.name}`;
}

export default function OnboardingScreen() {
  const [zip, setZip] = useState('');
  const [error, setError] = useState(false);
  const lookup = useZipLookup(zip);
  const queryClient = useQueryClient();
  const setLocation = usePrefs((s) => s.setLocation);

  const onContinue = async () => {
    if (!/^\d{5}$/.test(zip)) {
      setError(true);
      return;
    }
    let result;
    try {
      result = await queryClient.fetchQuery({
        queryKey: queryKeys.zip(zip),
        queryFn: () => api.lookupZip(zip),
        retry: false,
      });
    } catch {
      setError(true);
      return;
    }
    setLocation(zip, result.state.abbr, result.region.key);
    router.replace('/');
  };

  const found = zip.length === 5 ? lookup.data : undefined;
  // Valid-looking ZIPs outside the 50 states and DC (territories, military) explain themselves.
  const lookupError = zip.length === 5 && lookup.error ? lookup.error.message : null;

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen paddingX={layout.onboardingX} contentStyle={styles.content}>
        <View style={styles.brand}>
          <GasPump size={20} color={colors.accent} />
          <Text variant="control" style={styles.brandText}>
            DieselDelta
          </Text>
        </View>

        <View style={styles.intro}>
          <Text variant="display" accessibilityRole="header">
            When diesel falls, do grocery prices follow?
          </Text>
          <Text color={colors.neutral[400]}>
            DieselDelta compares the regional diesel index with the shelf prices of the items you
            buy. Your ZIP sets which fuel series is used.
          </Text>
        </View>

        <View style={styles.field}>
          <Text variant="caption" color={alpha(colors.text, 0.7)} nativeID="zip-label">
            Home ZIP code
          </Text>
          <Input
            accessibilityLabel="Home ZIP code"
            aria-labelledby="zip-label"
            value={zip}
            onChangeText={(t) => {
              setZip(t.replace(/\D/g, '').slice(0, 5));
              setError(false);
            }}
            placeholder="77002"
            keyboardType="number-pad"
            textContentType="postalCode"
            autoComplete="postal-code"
            maxLength={5}
            height={48}
            numeric
            invalid={error}
            textStyle={styles.zip}
            returnKeyType="done"
            onSubmitEditing={onContinue}
          />
          {error || lookupError ? (
            <Text variant="caption" color={colors.accentRamp[300]} accessibilityRole="alert">
              {lookupError ?? ZIP_ERROR}
            </Text>
          ) : null}
        </View>

        {found ? (
          <Card padding={14} gap={10} style={styles.card}>
            <Kicker style={styles.kicker}>Fuel series</Kicker>
            <View style={styles.regionRow}>
              <MapPin size={18} color={colors.accent} style={styles.pin} />
              <View style={styles.regionText}>
                <Text variant="control" style={styles.regionName}>
                  {found.region.name}
                </Text>
                <Text variant="bodySmall" color={colors.neutral[400]}>
                  {seriesLine(found)}
                </Text>
              </View>
            </View>
            <Text variant="bodySmall" numeric color={colors.neutral[400]}>
              {`Current price ${money(found.currentDiesel)}/gal, week of ${formatDate(fromISODate(found.asOf), true)}`}
            </Text>
          </Card>
        ) : null}

        <View style={styles.footer}>
          <Button label="Continue" height={50} large block onPress={onContinue} />
          <Text variant="caption" color={colors.neutral[500]} style={styles.center}>
            Source: U.S. EIA weekly retail diesel. No account required.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  brandText: { fontSize: 15 },
  intro: { gap: 12, marginTop: 40 },
  field: { gap: 5 },
  zip: { fontSize: 20, letterSpacing: em(0.12, 20) },
  card: { paddingHorizontal: 16 },
  kicker: { fontSize: 10 },
  regionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pin: { marginTop: 2 },
  regionText: { gap: 2, flex: 1 },
  regionName: { fontSize: 15 },
  footer: { marginTop: 'auto', gap: 12, paddingBottom: 12 },
  center: { textAlign: 'center' },
});
