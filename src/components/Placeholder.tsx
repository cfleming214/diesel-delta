import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { Card, Screen, ScreenHeader, Text } from '@/ui';

import { BackButton } from './BackButton';
import { TAB_BAR_CLEARANCE } from './TabBar';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Pushed screens show a back button; modal screens a close button. */
  nav?: 'tab' | 'push' | 'modal';
  phase: string;
};

/** Temporary screen body until each screen is built. */
export function Placeholder({ title, subtitle, right, nav = 'tab', phase }: Props) {
  return (
    <Screen scroll bottomInset={nav === 'tab' ? TAB_BAR_CLEARANCE : 32}>
      {nav !== 'tab' ? (
        <View style={styles.top}>
          <BackButton close={nav === 'modal'} />
        </View>
      ) : null}
      <ScreenHeader title={title} subtitle={subtitle} right={right} />
      <Card style={styles.card}>
        <Text variant="bodySmall" color={colors.neutral[400]}>
          {`Built in ${phase}. See design/handoff/README.md for the spec.`}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginBottom: 12 },
  card: { marginTop: 20 },
});
