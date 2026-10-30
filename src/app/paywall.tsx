import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check } from '@/ui/icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { PRO_FEATURES, type PlanKey } from '@/data';
import { purchases, PurchaseCancelledError } from '@/lib/purchases';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { alpha, colors, em, fonts, radius } from '@/theme';
import { Button, Kicker, Screen, Text } from '@/ui';
import { reportError } from '@/lib/errors';
import { track } from '@/lib/telemetry';

export default function PaywallScreen() {
  const isPro = usePrefs((s) => s.isPro);
  const unlockPro = usePrefs((s) => s.unlockPro);
  const [plan, setPlan] = useState<PlanKey>('year');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const offerings = useQuery({ queryKey: ['offerings'], queryFn: () => purchases.getOfferings() });
  const selected = offerings.data?.find((o) => o.key === plan);
  useEffect(() => track('paywall_view', { pro: isPro }), [isPro]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const buy = async () => {
    if (isPro || busy) return;
    setBusy('buy');
    try {
      const result = await purchases.purchase(plan);
      unlockPro(result.plan);
      track('purchase', { plan: result.plan });
      close();
      toast('Pro unlocked');
    } catch (e) {
      if (!(e instanceof PurchaseCancelledError)) {
        reportError(e, { where: 'purchase', plan });
        toast('The purchase did not go through');
      }
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    try {
      const { plan: owned } = await purchases.restore();
      track('restore', { found: owned != null });
      if (owned) {
        unlockPro(owned);
        close();
        toast('Pro restored');
      } else {
        toast('No previous purchase found');
      }
    } catch (e) {
      reportError(e, { where: 'restore' });
      toast('Could not reach the store');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll bottomInset={24} contentStyle={styles.content}>
      <View style={styles.top}>
        <BackButton close />
      </View>
      <View style={styles.head}>
        <Kicker>DieselDelta Pro</Kicker>
        <Text style={styles.title} accessibilityRole="header">
          More history, more baskets, local detail.
        </Text>
        <Text variant="bodySmall" color={colors.neutral[400]} style={styles.body14}>
          The headline Delta stays free and public.
        </Text>
      </View>

      <View style={styles.features}>
        {PRO_FEATURES.map((f) => (
          <View key={f} style={styles.feature}>
            <Check size={16} color={colors.accent} style={styles.check} />
            <Text variant="bodySmall" style={styles.body14}>
              {f}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.plans} accessibilityRole="radiogroup">
        {(offerings.data ?? []).map((o) => {
          const on = o.key === plan;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              aria-checked={on}
              accessibilityLabel={`${o.name}, ${o.price}, ${o.sub}`}
              onPress={() => setPlan(o.key)}
              style={[
                styles.plan,
                {
                  borderColor: on ? colors.accent : colors.divider,
                  backgroundColor: on ? alpha(colors.accent, 0.1) : colors.surface,
                },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  {
                    borderColor: on ? colors.accent : colors.divider,
                    backgroundColor: on ? colors.accent : 'transparent',
                  },
                ]}
              />
              <View style={styles.flex}>
                <Text>{o.name}</Text>
                <Text variant="caption" color={colors.neutral[400]}>
                  {o.sub}
                </Text>
              </View>
              <Text numeric style={styles.price}>
                {o.price}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Button
        label={
          isPro
            ? 'Pro is active'
            : busy === 'buy'
              ? 'Contacting the store…'
              : `Start Pro · ${selected?.price ?? ''}`
        }
        height={50}
        large
        block
        disabled={isPro || busy != null || !selected}
        onPress={buy}
      />
      <Button
        label={busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
        variant="ghost"
        height={44}
        disabled={busy != null}
        onPress={restore}
      />
      <Text variant="caption" color={colors.neutral[500]} style={styles.fine}>
        No advertising. Receipt data is never sold. Cancel anytime in Settings.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  top: { flexDirection: 'row' },
  head: { gap: 8 },
  title: { fontFamily: fonts.medium, fontSize: 30, lineHeight: 34, letterSpacing: em(-0.015, 30) },
  body14: { fontSize: 14, lineHeight: 20 },
  features: { gap: 10 },
  feature: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  check: { marginTop: 2 },
  plans: { gap: 8 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    boxShadow: `inset 0 0 0 4px ${colors.surface}`,
  },
  flex: { flex: 1 },
  price: { fontSize: 16 },
  fine: { fontSize: 11, textAlign: 'center' },
});
