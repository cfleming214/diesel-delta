import { Redirect } from 'expo-router';
import { Barcode, GasPump, MagnifyingGlass, ShareNetwork, Star } from '@/ui/icons';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { METHODOLOGY } from '@/data';
import { VERDICTS, WINDOWS, type Verdict, type WindowDays } from '@/domain';
import { toast } from '@/store/toast';
import { alpha, colors, fonts } from '@/theme';
import {
  Button,
  Card,
  FadeRule,
  IconButton,
  Input,
  Kicker,
  KVRow,
  RadioDot,
  Screen,
  ScreenHeader,
  Seg,
  Sheet,
  Stepper,
  Tag,
  Text,
  Toggle,
} from '@/ui';

/** Dev-only gallery of every primitive, for side-by-side review against the prototype. */
export default function KitchenSink() {
  const [win, setWin] = useState<WindowDays>(90);
  const [on, setOn] = useState(true);
  const [tol, setTol] = useState(3);
  const [plan, setPlan] = useState<'year' | 'month'>('year');
  const [zip, setZip] = useState('77002');
  const [sheet, setSheet] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen scroll bottomInset={32}>
      <View style={styles.top}>
        <BackButton />
      </View>
      <ScreenHeader
        title="Kitchen sink"
        subtitle="Nocturne primitives"
        right={
          <>
            <IconButton icon={MagnifyingGlass} accessibilityLabel="Search" />
            <IconButton icon={ShareNetwork} accessibilityLabel="Share" />
          </>
        }
      />

      <Section title="Type">
        <Text variant="display">When diesel falls, do grocery prices follow?</Text>
        <Text variant="title">Screen title</Text>
        <Text variant="section">Section heading</Text>
        <Text variant="body">Body 15/1.5. Diesel fell 4.2% over 90 days.</Text>
        <Text variant="caption" color={colors.neutral[400]}>
          Caption 12pt in neutral-400
        </Text>
        <Kicker>Delta · 90 days</Kicker>
        <Text numeric style={styles.hero}>
          4.0
        </Text>
      </Section>

      <Section title="Buttons">
        <Button label="Share this Delta" icon={ShareNetwork} height={48} />
        <Button label="Continue" height={50} large />
        <View style={styles.row}>
          <Button label="Edit" variant="secondary" />
          <Button label="Sources" variant="ghost" />
          <Button label="Disabled" disabled />
        </View>
        <View style={styles.row}>
          <IconButton icon={Barcode} variant="primary" accessibilityLabel="Scan" />
          <IconButton icon={Star} weight="fill" color={colors.accent} accessibilityLabel="Follow" />
          <IconButton icon={GasPump} accessibilityLabel="Fuel" />
        </View>
      </Section>

      <Section title="Controls">
        <Seg
          height={38}
          value={win}
          onChange={setWin}
          options={WINDOWS.map((w) => ({ value: w.days, label: w.short }))}
        />
        <Input
          value={zip}
          onChangeText={(t) => setZip(t.replace(/\D/g, '').slice(0, 5))}
          keyboardType="number-pad"
          maxLength={5}
          height={48}
          numeric
          textStyle={styles.zip}
        />
        <Input icon={MagnifyingGlass} placeholder="Item, barcode or product link" />
        <View style={styles.between}>
          <Text variant="bodySmall">Diesel crosses $3.25/gal</Text>
          <Toggle value={on} onChange={setOn} accessibilityLabel="Diesel alert" />
        </View>
        <View style={styles.between}>
          <Text variant="bodySmall">Delta tolerance</Text>
          <Stepper
            value={tol}
            onChange={setTol}
            min={1}
            max={15}
            format={(v) => `${v} pts`}
            accessibilityLabel="Delta tolerance"
          />
        </View>
        <View style={styles.row}>
          {(['year', 'month'] as const).map((p) => (
            <Button
              key={p}
              label={p === 'year' ? 'Yearly' : 'Monthly'}
              variant="secondary"
              onPress={() => setPlan(p)}
              icon={() => <RadioDot selected={plan === p} />}
            />
          ))}
        </View>
      </Section>

      <Section title="Tags">
        <View style={styles.row}>
          {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
            <Tag key={v} label={VERDICTS[v].label} tone={VERDICTS[v].tone} />
          ))}
        </View>
        <View style={styles.row}>
          <Tag label="Gouge Gap" tone="accent" size="sm" />
          <Tag label="Sticky Price" tone="outline" size="lg" />
          <Tag label="Wide gap" tone="accent" />
        </View>
      </Section>

      <Section title="Surfaces">
        <Card>
          <Kicker>Fuel series</Kicker>
          <Text variant="section">Gulf Coast (PADD 3)</Text>
          <Text variant="caption" color={colors.neutral[400]}>
            State series: Texas retail diesel
          </Text>
        </Card>
        <FadeRule />
        <View style={styles.row}>
          <Button label="Show toast" variant="secondary" onPress={() => toast('Price saved')} />
          <Button label="Open sheet" variant="secondary" onPress={() => setSheet(true)} />
        </View>
      </Section>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Methodology and sources">
        {METHODOLOGY.map((row) => (
          <KVRow key={row.k} k={row.k} v={row.v} />
        ))}
      </Sheet>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="section">{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { marginBottom: 12 },
  section: { gap: 12, marginTop: 28 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  hero: {
    fontFamily: fonts.medium,
    fontSize: 96,
    lineHeight: 100,
    letterSpacing: -0.045 * 96,
    textShadowColor: alpha(colors.accent, 0.45),
    textShadowRadius: 36,
  },
  zip: { fontSize: 20, letterSpacing: 0.12 * 20 },
});
