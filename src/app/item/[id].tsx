import { router, useLocalSearchParams } from 'expo-router';
import { Camera, Info, ShareNetwork, Star } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { ItemPriceChart } from '@/components/ItemPriceChart';
import { useItem, useProvenance } from '@/data';
import {
  formatDate,
  fromISODate,
  money,
  pct,
  sgn,
  verdictExplanation,
  VERDICTS,
  type LedgerTag,
} from '@/domain';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme';
import { Button, Card, IconButton, KVRow, Screen, Sheet, Tag, Text } from '@/ui';
import { track } from '@/lib/telemetry';

const TAG_COLOR: Record<LedgerTag, string> = {
  'Fuel-correlated': colors.accentRamp[300],
  'Partial rollback': colors.accentRamp[300],
  Rollback: colors.neutral[300],
};

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const region = usePrefs((s) => s.region);
  const zip = usePrefs((s) => s.zip);
  const followed = usePrefs((s) => s.followed.includes(id));
  const toggleFollow = usePrefs((s) => s.toggleFollow);
  const { data: item, error } = useItem(id, region);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const provenance = useProvenance(id, zip, sourcesOpen);
  const verdictKind = item?.verdict;
  useEffect(() => {
    if (verdictKind) track('item_view', { item: id, verdict: verdictKind });
  }, [id, verdictKind]);

  const top = (
    <View style={styles.top}>
      <BackButton />
      {item ? (
        <View style={styles.actions}>
          <IconButton
            icon={Star}
            weight={followed ? 'fill' : 'regular'}
            color={followed ? colors.accent : undefined}
            accessibilityLabel={followed ? 'Unfollow' : 'Follow'}
            onPress={() => toggleFollow(id)}
          />
          <IconButton
            icon={ShareNetwork}
            accessibilityLabel="Share"
            onPress={() => router.push('/share')}
          />
        </View>
      ) : null}
    </View>
  );

  if (!item) {
    return (
      <Screen contentStyle={styles.content}>
        {top}
        {error ? <Text color={colors.neutral[400]}>This item is not tracked.</Text> : null}
      </Screen>
    );
  }

  const verdict = VERDICTS[item.verdict];

  return (
    <Screen scroll bottomInset={24} contentStyle={styles.content}>
      {top}
      <View style={styles.head}>
        <Text variant="caption" color={colors.neutral[400]}>
          {`${item.category} · ${item.size} · ${item.store}`}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {item.name}
        </Text>
        <Tag label={verdict.label} tone={verdict.tone} size="lg" />
        <Text variant="bodySmall" color={colors.neutral[300]} style={styles.explain}>
          {verdictExplanation(item.verdict, item.fuelSincePct)}
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat label="Shelf price" value={money(item.price)} />
        <Stat label="Unreturned" value={money(item.unreturned)} color={colors.accentRamp[300]} />
        <Stat label="Diesel since last rise" value={`${sgn(item.fuelSincePct)}%`} />
      </View>

      <ItemPriceChart item={item} />

      <View style={styles.ledger}>
        <View style={styles.ledgerHead}>
          <Text variant="section">Price changes</Text>
          <Button
            label="Sources"
            variant="ghost"
            icon={Info}
            height={36}
            onPress={() => setSourcesOpen(true)}
          />
        </View>
        {item.ledger.map((l) => (
          <View key={l.date} style={styles.ledgerRow}>
            <View style={styles.ledgerLine}>
              <Text variant="control" numeric style={styles.regular}>
                {`${money(l.from)} → ${money(l.to)}`}
              </Text>
              <Text variant="control" numeric style={styles.regular}>
                {`${sgn(pct(l.from, l.to))}%`}
              </Text>
            </View>
            <View style={styles.ledgerLine}>
              <Text variant="caption" numeric color={colors.neutral[400]}>
                {`${formatDate(fromISODate(l.date), true)} · Diesel ${money(l.fuelPrice)}`}
              </Text>
              <Text variant="caption" color={TAG_COLOR[l.tag]}>
                {l.tag}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Sheet visible={sourcesOpen} onClose={() => setSourcesOpen(false)} title="Data provenance">
        {provenance.data ? (
          <>
            <KVRow k="Source" v={provenance.data.source} />
            <KVRow k="Captured" v={provenance.data.captured} />
            <KVRow k="Method" v={provenance.data.method} />
            <KVRow k="Confidence" v={provenance.data.confidence} />
            <Button
              label="Report a correction with a shelf-tag photo"
              variant="secondary"
              icon={Camera}
              block
              style={styles.report}
              onPress={() => {
                setSourcesOpen(false);
                toast('Corrections open in a later update');
              }}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card padding={10} gap={2} style={styles.stat}>
      <Text variant="caption" color={colors.neutral[400]} style={styles.statLabel}>
        {label}
      </Text>
      <Text numeric color={color} style={styles.statValue}>
        {value}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 6 },
  head: { gap: 8 },
  explain: { fontSize: 14, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, paddingHorizontal: 12 },
  statLabel: { fontSize: 11 },
  // Labels may wrap; keep values aligned along the bottom of equal-height cards.
  statValue: { fontSize: 18, lineHeight: 24, marginTop: 'auto' },
  ledger: { gap: 4 },
  ledgerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ledgerRow: {
    gap: 2,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowRule,
  },
  ledgerLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  regular: { fontFamily: fonts.regular },
  report: { marginTop: 8 },
});
