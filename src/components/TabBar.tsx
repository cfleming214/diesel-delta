import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Basket, ChartBar, Gauge, MagnifyingGlass, Receipt, type Icon } from '@/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { alpha, colors, glow, layout } from '@/theme';
import { FadeRule, Text } from '@/ui';

/** Space screens leave at the bottom so content clears the floating tab bar and a toast above it. */
export const TAB_BAR_CLEARANCE = 150;

export const TABS: Record<string, { label: string; icon: Icon }> = {
  index: { label: 'Today', icon: Gauge },
  search: { label: 'Search', icon: MagnifyingGlass },
  basket: { label: 'Basket', icon: Basket },
  log: { label: 'Log', icon: Receipt },
  insights: { label: 'Insights', icon: ChartBar },
};

/** The bar's full height for a given bottom safe-area inset. */
export const tabBarHeight = (bottomInset: number) =>
  layout.tabBarBody + (bottomInset > 0 ? 28 : 10);

type Props = Pick<BottomTabBarProps, 'state' | 'emitter' | 'navigateToTab' | 'insets'>;

/**
 * tabs5 bar: full width over a blurred 86% ground, a fading top rule, 22pt icons over 10pt labels.
 * The active tab is accent, filled, and marked by an 18×2 accent bar with an 8pt glow.
 */
export function TabBar({ state, emitter, navigateToTab, insets }: Props) {
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { height: tabBarHeight(insets.bottom), paddingBottom: insets.bottom > 0 ? 28 : 10 },
      ]}
    >
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      <FadeRule style={styles.rule} />
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = index === state.index;
        const color = focused ? colors.accent : colors.neutral[400];
        const IconCmp = tab.icon;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            aria-selected={focused}
            accessibilityLabel={tab.label}
            style={styles.item}
            onPress={() => {
              const event = emitter.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
          >
            <View style={[styles.mark, focused && styles.markOn]} />
            <IconCmp size={22} color={color} weight={focused ? 'fill' : 'regular'} />
            <Text variant="tabLabel" color={color}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: 6,
    paddingHorizontal: 6,
  },
  tint: { backgroundColor: alpha(colors.bg, 0.86) },
  rule: { position: 'absolute', top: 0, left: 0, right: 0 },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    minHeight: 50,
    paddingTop: 6,
  },
  mark: { position: 'absolute', top: -6, width: 18, height: 2, borderRadius: 1 },
  markOn: { backgroundColor: colors.accent, ...glow(8) },
});
