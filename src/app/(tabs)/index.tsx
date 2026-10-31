import { router } from 'expo-router';
import { ShareNetwork } from '@/ui/icons';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DeltaHeader } from '@/components/DeltaHeader';
import { LagChart } from '@/components/LagChart';
import { TAB_BAR_CLEARANCE } from '@/components/TabBar';
import { useDeltaModel } from '@/data';
import { dateAtIndex, formatDate, indexWindow, sgn, WINDOWS } from '@/domain';
import { usePrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';
import { colors } from '@/theme';
import { Button, IconButton, Screen, ScreenHeader, Seg, Text } from '@/ui';
import { track } from '@/lib/telemetry';

const CHART_HEIGHT = 230;
const WINDOW_OPTIONS = WINDOWS.map((w) => ({ value: w.days, label: w.short }));

export default function TodayScreen() {
  const zip = usePrefs((s) => s.zip);
  const window = useUi((s) => s.window);
  const setWindow = useUi((s) => s.setWindow);
  const { model, error, state, basketEmpty } = useDeltaModel({ window });
  const [scrub, setScrub] = useState<number | null>(null);

  const indexed = useMemo(
    () => (model ? indexWindow(model.fuel, model.basket, model.start, model.end) : null),
    [model],
  );

  const place = `${state ?? ''} ${zip ?? ''}`;
  const subtitle = model ? `${place} · ${formatDate(model.latestDate, true)}` : place;

  let body = null;
  if (model && indexed) {
    const k = Math.min(scrub ?? indexed.basket.length - 1, indexed.basket.length - 1);
    const b = indexed.basket[k]!;
    const f = indexed.fuel[k]!;
    const day = formatDate(dateAtIndex(model.startDate, model.start + k));
    body = (
      <>
        <View style={styles.block}>
          <DeltaHeader dateLabel={day} gap={b - f} basketIndex={b} fuelIndex={f} />
          <View>
            <LagChart
              fuel={model.fuel}
              basket={model.basket}
              start={model.start}
              end={model.end}
              height={CHART_HEIGHT}
              bleed={4}
              index={scrub}
              onIndexChange={(i) => {
                if (i == null && scrub != null) track('scrub', { screen: 'today', window });
                setScrub(i);
              }}
              accessibilityValueText={`${day}: basket ${b.toFixed(1)}, diesel ${f.toFixed(1)}, gap ${sgn(b - f)} points`}
            />
            <View style={styles.caption}>
              <Text variant="caption" color={colors.neutral[500]} style={styles.captionText}>
                {formatDate(dateAtIndex(model.startDate, model.start))}
              </Text>
              <Text variant="caption" color={colors.neutral[500]} style={styles.captionText}>
                Drag to scrub · indexed to 100
              </Text>
              <Text variant="caption" color={colors.neutral[500]} style={styles.captionText}>
                {formatDate(model.latestDate)}
              </Text>
            </View>
          </View>
        </View>
        <Text numeric>{model.verdict}</Text>
        <Button
          label="Share this chart"
          icon={ShareNetwork}
          height={48}
          block
          onPress={() => router.push('/share')}
        />
      </>
    );
  } else if (basketEmpty) {
    body = (
      <Text color={colors.neutral[400]}>
        Your basket is empty. Add the items you buy to see your Delta.
      </Text>
    );
  } else if (error) {
    body = (
      <Text color={colors.neutral[400]}>
        Prices could not be loaded. Check your connection and try again.
      </Text>
    );
  }

  return (
    <Screen scroll bottomInset={TAB_BAR_CLEARANCE} contentStyle={styles.content}>
      <ScreenHeader
        title="Today"
        subtitle={subtitle}
        right={
          <IconButton
            icon={ShareNetwork}
            accessibilityLabel="Share"
            onPress={() => router.push('/share')}
          />
        }
      />
      <Seg
        height={38}
        value={window}
        onChange={(w) => {
          setScrub(null);
          setWindow(w);
          track('window_change', { window: w, screen: 'today' });
        }}
        options={WINDOW_OPTIONS}
        accessibilityLabel="Window"
      />
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  block: { gap: 16 },
  caption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  captionText: { fontSize: 11 },
});
