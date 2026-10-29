import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LagChart } from '@/components/LagChart';
import { TAB_BAR_CLEARANCE } from '@/components/TabBar';
import { localSeries, useDeltaModel, type FuelScope, type FuelSeriesKind } from '@/data';
import {
  bestLag,
  correlationAtLag,
  dateAtIndex,
  formatCorrelation,
  formatDate,
  indexWindow,
  money,
  sgn,
  WINDOWS,
} from '@/domain';
import { usePrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';
import { colors, fonts } from '@/theme';
import { Card, Screen, ScreenHeader, Seg, Slider, Tag, Text } from '@/ui';

const CHART_HEIGHT = 250;
const MAX_LAG_WEEKS = 12;
const WINDOW_OPTIONS = WINDOWS.map((w) => ({ value: w.days, label: w.short }));
const SERIES_OPTIONS = [
  { value: 'diesel', label: 'Diesel' },
  { value: 'gas', label: 'Gasoline' },
] as const;

const lagLabel = (w: number) => (w === 0 ? 'none' : w === 1 ? '1 week' : `${w} weeks`);

export default function ChartScreen() {
  const state = usePrefs((s) => s.state);
  const isPro = usePrefs((s) => s.isPro);
  const {
    window,
    lagWeeks,
    series,
    scope: chosenScope,
    setWindow,
    setLagWeeks,
    setSeries,
    setScope,
  } = useUi();
  // The local option exists only where EIA publishes a series finer than the PADD.
  const local = state ? localSeries(state, series) : null;
  const scope: FuelScope = chosenScope === 'state' && !local ? 'padd' : chosenScope;
  const { model, seriesName: areaName } = useDeltaModel({ window, kind: series, scope });
  const [scrub, setScrub] = useState<number | null>(null);

  const scopeName = scope === 'national' ? 'National' : (areaName?.split(' (')[0] ?? '');
  const seriesName = series === 'diesel' ? 'Diesel' : 'Gasoline';
  const lagDays = lagWeeks * 7;

  const scopeOptions: { value: FuelScope; label: string }[] = [
    { value: 'national', label: 'U.S.' },
    { value: 'padd', label: 'PADD' },
    ...(local ? [{ value: 'state' as const, label: local.isState ? state! : 'Local' }] : []),
  ];

  // Fit statistics over the trailing 12 months, with enough lead-in for the largest lag.
  const fit = useMemo(() => {
    if (!model) return null;
    const from = Math.max(model.fuel.length - 365, MAX_LAG_WEEKS * 7);
    return {
      best: bestLag(model.fuel, model.basket, from, MAX_LAG_WEEKS),
      corr: correlationAtLag(model.fuel, model.basket, from, lagWeeks),
    };
  }, [model, lagWeeks]);

  const indexed = useMemo(
    () => (model ? indexWindow(model.fuel, model.basket, model.start, model.end, lagDays) : null),
    [model, lagDays],
  );

  const onScope = (next: FuelScope) => {
    if (next === 'state' && !isPro) {
      router.push('/paywall');
      return;
    }
    setScrub(null);
    setScope(next);
  };

  let readout = null;
  if (model && indexed) {
    const k = Math.min(scrub ?? indexed.basket.length - 1, indexed.basket.length - 1);
    const day = model.start + k;
    const b = indexed.basket[k]!;
    const f = indexed.fuel[k]!;
    const fuelPrice = model.fuel[Math.max(0, day - lagDays)]!;
    readout = (
      <Card padding={14} gap={10} style={styles.card}>
        <View style={styles.readout}>
          <View style={styles.gapCol}>
            <Text variant="caption" color={colors.neutral[400]}>
              {formatDate(dateAtIndex(model.startDate, day))}
            </Text>
            <Text numeric style={styles.gap}>{`${sgn(b - f)} pts gap`}</Text>
          </View>
          <View style={styles.values}>
            <Text variant="caption" numeric color={colors.accentRamp[300]}>
              {`Basket ${money(model.basket[day]!)} · ${b.toFixed(1)}`}
            </Text>
            <Text variant="caption" numeric color={colors.neutral[400]}>
              {`${seriesName} ${money(fuelPrice)} · ${f.toFixed(1)}`}
            </Text>
          </View>
        </View>
        <LagChart
          fuel={model.fuel}
          basket={model.basket}
          start={model.start}
          end={model.end}
          lagDays={lagDays}
          height={CHART_HEIGHT}
          index={scrub}
          onIndexChange={setScrub}
          accessibilityValueText={`${formatDate(dateAtIndex(model.startDate, day))}: gap ${sgn(b - f)} points`}
        />
        <View style={styles.axis}>
          <Text variant="caption" color={colors.neutral[500]} style={styles.axisText}>
            {formatDate(dateAtIndex(model.startDate, model.start))}
          </Text>
          <Text variant="caption" color={colors.neutral[500]} style={styles.axisText}>
            {formatDate(model.latestDate)}
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Screen scroll bottomInset={TAB_BAR_CLEARANCE} contentStyle={styles.content}>
      <ScreenHeader title="Chart" right={<Tag label={scopeName} />} />
      <View style={styles.segRow}>
        <Seg
          style={styles.seriesSeg}
          value={series}
          onChange={(v: FuelSeriesKind) => {
            setScrub(null);
            setSeries(v);
          }}
          options={SERIES_OPTIONS}
          accessibilityLabel="Fuel series"
        />
        <Seg
          style={styles.scopeSeg}
          value={scope}
          onChange={onScope}
          options={scopeOptions}
          accessibilityLabel="Scope"
        />
      </View>
      {readout}
      <Seg
        height={38}
        value={window}
        onChange={(w) => {
          setScrub(null);
          setWindow(w);
        }}
        options={WINDOW_OPTIONS}
        accessibilityLabel="Window"
      />
      <View style={styles.lag}>
        <View style={styles.lagRow}>
          <Text variant="control" style={styles.lagLabel}>{`Lag: ${lagLabel(lagWeeks)}`}</Text>
          {fit ? (
            <Text variant="bodySmall" numeric color={colors.neutral[400]}>
              {`Best fit ${fit.best.weeks} wks`}
            </Text>
          ) : null}
        </View>
        <Slider
          testID="lag-slider"
          value={lagWeeks}
          min={0}
          max={MAX_LAG_WEEKS}
          onChange={(w) => {
            setScrub(null);
            setLagWeeks(w);
          }}
          accessibilityLabel="Lag"
          accessibilityValueText={lagLabel(lagWeeks)}
        />
        {fit ? (
          <Text variant="bodySmall" numeric color={colors.neutral[400]}>
            {`Shifts the ${seriesName.toLowerCase()} line forward to test how many weeks shelf prices trail fuel. Correlation at this lag: ${formatCorrelation(fit.corr)}.`}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  segRow: { flexDirection: 'row', gap: 8 },
  seriesSeg: { flex: 1 },
  scopeSeg: { flex: 1.4 },
  card: { paddingBottom: 10 },
  readout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  gapCol: { gap: 2 },
  gap: { fontSize: 22, lineHeight: 28 },
  values: { gap: 2, alignItems: 'flex-end' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 11 },
  lag: { gap: 8 },
  lagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lagLabel: { fontFamily: fonts.regular },
});
