import { beforeEach, describe, expect, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_BASKET_IDS } from '@/data';
import { basketIds, DEFAULT_PREFS, migratePrefs, usePrefs } from '@/store/prefs';
import { useUi } from '@/store/ui';

describe('prefs', () => {
  beforeEach(() => usePrefs.getState().reset());

  test('defaults to the 16-item basket with no location', () => {
    const s = usePrefs.getState();
    expect(s.zip).toBeNull();
    expect(basketIds(s.basket)).toEqual(DEFAULT_BASKET_IDS);
    expect(s.tolerance).toBe(3);
  });

  test('persists the location to device storage', async () => {
    usePrefs.getState().setLocation('77002', 'TX', 'gulf');
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('dd.prefs');
    expect(JSON.parse(raw!).state).toMatchObject({ zip: '77002', region: 'gulf' });
  });

  test('unlockPro records the plan', () => {
    usePrefs.getState().unlockPro('year');
    expect(usePrefs.getState()).toMatchObject({ isPro: true, plan: 'year' });
    usePrefs.getState().reset();
    expect(usePrefs.getState().isPro).toBe(DEFAULT_PREFS.isPro);
  });
});

describe('prefs migration', () => {
  test('v1 → v2 derives state and the real PADD region from the ZIP', () => {
    // The prototype mapped any 3xxxx ZIP to the Gulf Coast; Miami is East Coast (PADD 1C).
    expect(migratePrefs({ zip: '33101', region: 'gulf' }, 1)).toMatchObject({
      zip: '33101',
      state: 'FL',
      region: 'east',
    });
  });

  test('unsupported ZIPs go back through onboarding', () => {
    expect(migratePrefs({ zip: '00901', region: 'east' }, 1)).toMatchObject({
      zip: null,
      state: null,
      region: null,
    });
  });

  test('current versions pass through', () => {
    const v2 = { zip: '77002', state: 'TX', region: 'gulf' as const };
    expect(migratePrefs(v2, 2)).toBe(v2);
  });
});

describe('basket actions', () => {
  beforeEach(() => usePrefs.getState().reset());
  const ids = () => basketIds(usePrefs.getState().basket);

  test('add ignores duplicates; remove drops the item', () => {
    usePrefs.getState().addToBasket('yogurt');
    usePrefs.getState().addToBasket('yogurt');
    expect(ids().filter((id) => id === 'yogurt')).toHaveLength(1);
    expect(ids().at(-1)).toBe('yogurt');
    usePrefs.getState().removeFromBasket('milk');
    expect(ids()).not.toContain('milk');
  });

  test('move reorders and clamps out-of-range targets', () => {
    usePrefs.getState().moveBasketItem(0, 2);
    expect(ids().slice(0, 3)).toEqual(['eggs', 'bread', 'milk']);
    usePrefs.getState().moveBasketItem(2, -5);
    expect(ids().slice(0, 3)).toEqual(['milk', 'eggs', 'bread']);
    usePrefs.getState().moveBasketItem(0, 99);
    expect(ids().at(-1)).toBe('milk');
  });

  test('toggleFollow', () => {
    usePrefs.getState().toggleFollow('milk');
    expect(usePrefs.getState().followed).not.toContain('milk');
    usePrefs.getState().toggleFollow('milk');
    expect(usePrefs.getState().followed).toContain('milk');
  });
});

describe('ui', () => {
  test('clamps lag to 0–12 whole weeks', () => {
    useUi.getState().setLagWeeks(14);
    expect(useUi.getState().lagWeeks).toBe(12);
    useUi.getState().setLagWeeks(-1);
    expect(useUi.getState().lagWeeks).toBe(0);
    useUi.getState().setLagWeeks(3.4);
    expect(useUi.getState().lagWeeks).toBe(3);
  });
});
