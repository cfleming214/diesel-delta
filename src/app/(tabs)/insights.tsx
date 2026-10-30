import { router } from 'expo-router';
import { BookOpen, CaretRight, StarFour, Storefront, type Icon } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TAB_BAR_CLEARANCE } from '@/components/TabBar';
import {
  AREA_NAMES,
  METHODOLOGY,
  PADD_AREA,
  fuelArea,
  localSeries,
  useBasketSeries,
  useCategoryPassThrough,
  useDeltaModel,
  useFuelSeriesMany,
  type FuelArea,
  type RegionKey,
} from '@/data';
import { alignSeries, money, pct, sgn, windowInfo, windowRange } from '@/domain';
import { basketIds, usePrefs, type AlertPrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';
import { colors } from '@/theme';
import { Card, KVRow, Screen, Sheet, Stepper, Text, Toggle } from '@/ui';

const REGION_ROWS: RegionKey[] = ['gulf', 'east', 'mid', 'rocky', 'west', 'nat'];
const REGION_AREAS: FuelArea[] = REGION_ROWS.map((r) => PADD_AREA[r]);

export default function InsightsScreen() {
  const prefs = usePrefs();
  const window = useUi((s) => s.window);
  const [methodology, setMethodology] = useState(false);
  const passThrough = useCategoryPassThrough(prefs.region).data ?? [];
  const { model } = useDeltaModel({ window });
  const basket = useBasketSeries(useMemo(() => basketIds(prefs.basket), [prefs.basket])).data;
  const regionSeries = useFuelSeriesMany(REGION_AREAS);

  // Each region's diesel change over the window, and the user's basket against it.
  const regionRows = REGION_ROWS.map((key, i) => {
    const fuel = regionSeries[i];
    const aligned = fuel && basket ? alignSeries(fuel, basket) : null;
    if (!aligned || aligned.a.length <= window) return { key, fuelPct: null, delta: null };
    const { start, end } = windowRange(aligned.a.length, window);
    const fuelPct = pct(aligned.a[start]!, aligned.a[end]!);
    const basketPct = pct(aligned.b[start]!, aligned.b[end]!);
    return { key, fuelPct, delta: basketPct - fuelPct };
  });

  const local = prefs.state ? localSeries(prefs.state, 'diesel') : null;
  const dieselSeriesName = prefs.state
    ? AREA_NAMES[fuelArea(prefs.state, 'diesel', 'state')]
    : 'U.S.';
  const followedCount = prefs.followed.length;
  const currentDelta = model ? Math.abs(model.delta).toFixed(1) : '–';

  const alertRows: { key: keyof AlertPrefs; title: string; detail: string }[] = [
    {
      key: 'dieselCross',
      title: `Diesel crosses ${money(prefs.dieselThreshold)}/gal`,
      detail: `${local?.isState ? local.name : dieselSeriesName} retail diesel, weekly`,
    },
    {
      key: 'followedDrop',
      title: 'A followed item drops in price',
      detail: `${followedCount} ${followedCount === 1 ? 'item' : 'items'} followed`,
    },
    {
      key: 'deltaTolerance',
      title: 'Delta exceeds tolerance',
      detail: `Currently ${currentDelta} pts, tolerance ${prefs.tolerance} pts`,
    },
  ];

  return (
    <Screen scroll bottomInset={TAB_BAR_CLEARANCE} contentStyle={styles.content}>
      <Text variant="title" accessibilityRole="header">
        Insights
      </Text>

      <View style={styles.section}>
        <SectionTitle
          title="Pass-through by category"
          subtitle="Share of the 90-day diesel decline reflected in shelf prices"
        />
        {passThrough.map((c) => (
          <View
            key={c.category}
            style={styles.catRow}
            accessibilityLabel={`${c.category} ${c.pct}%`}
          >
            <Text variant="bodySmall" style={styles.catName}>
              {c.category}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${c.pct}%` }]} />
            </View>
            <Text variant="bodySmall" numeric color={colors.neutral[300]} style={styles.catPct}>
              {`${c.pct}%`}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionTight}>
        <SectionTitle
          title="Delta by region"
          subtitle={`Your basket against each region's diesel series, ${windowInfo(window).label}`}
        />
        {regionRows.map((r) => {
          const mine = r.key === prefs.region;
          const name = AREA_NAMES[PADD_AREA[r.key]].split(' (')[0]!;
          return (
            <View key={r.key} style={styles.regionRow}>
              <Text
                variant="bodySmall"
                color={mine ? colors.accentRamp[300] : colors.text}
                style={styles.flex}
              >
                {r.key === 'nat' ? 'National' : name}
              </Text>
              <Text variant="bodySmall" numeric color={colors.neutral[400]}>
                {r.fuelPct == null ? '–' : `Diesel ${sgn(r.fuelPct)}%`}
              </Text>
              <Text variant="bodySmall" numeric style={styles.regionDelta}>
                {r.delta == null ? '–' : `${sgn(r.delta)} pts`}
              </Text>
            </View>
          );
        })}
      </View>

      <View>
        <Text variant="section" style={styles.alertsTitle}>
          Break alerts
        </Text>
        {alertRows.map((a) => (
          <View key={a.key} style={styles.alertRow}>
            <View style={styles.flex}>
              <Text variant="bodySmall" style={styles.alertTitle}>
                {a.title}
              </Text>
              <Text variant="caption" numeric color={colors.neutral[400]}>
                {a.detail}
              </Text>
            </View>
            <Toggle
              value={prefs.alerts[a.key]}
              onChange={(on) => prefs.setAlert(a.key, on)}
              accessibilityLabel={a.title}
            />
          </View>
        ))}
        <View style={styles.tolerance}>
          <Text variant="bodySmall" style={styles.alertTitle}>
            Delta tolerance
          </Text>
          <Stepper
            value={prefs.tolerance}
            min={1}
            max={15}
            onChange={prefs.setTolerance}
            format={(v) => `${v} pts`}
            accessibilityLabel="Delta tolerance"
          />
        </View>
      </View>

      <Card padding={0} gap={0} style={styles.links}>
        <LinkRow
          icon={Storefront}
          label="Retailer scorecard"
          onPress={() => router.push('/retailers')}
        />
        <LinkRow
          icon={BookOpen}
          label="Methodology and sources"
          onPress={() => setMethodology(true)}
        />
        <LinkRow
          icon={StarFour}
          label="DieselDelta Pro"
          value={prefs.isPro ? 'Active' : 'Free plan'}
          onPress={() => router.push('/paywall')}
          last
        />
      </Card>

      <Sheet
        visible={methodology}
        onClose={() => setMethodology(false)}
        title="Methodology and sources"
      >
        {METHODOLOGY.map((row) => (
          <KVRow key={row.k} k={row.k} v={row.v} />
        ))}
      </Sheet>
    </Screen>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="section">{title}</Text>
      <Text variant="caption" color={colors.neutral[400]}>
        {subtitle}
      </Text>
    </View>
  );
}

function LinkRow({
  icon: IconCmp,
  label,
  value,
  onPress,
  last,
}: {
  icon: Icon;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.link, !last && styles.linkRule, pressed && styles.pressed]}
    >
      <IconCmp size={20} color={colors.accent} />
      <Text style={styles.flex}>{label}</Text>
      {value ? (
        <Text variant="bodySmall" color={colors.neutral[400]}>
          {value}
        </Text>
      ) : null}
      <CaretRight size={16} color={colors.neutral[500]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22 },
  section: { gap: 10 },
  sectionTight: { gap: 6 },
  sectionTitle: { gap: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  catName: { width: 84 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.neutral[900] },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  catPct: { width: 40, textAlign: 'right' },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  regionDelta: { width: 72, textAlign: 'right' },
  flex: { flex: 1 },
  alertsTitle: { marginBottom: 6 },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  alertTitle: { fontSize: 14 },
  tolerance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  links: { paddingHorizontal: 14, paddingVertical: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  linkRule: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { opacity: 0.7 },
});
