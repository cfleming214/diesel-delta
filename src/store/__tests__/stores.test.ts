import { beforeEach, describe, expect, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_BASKET_IDS } from '@/data';
import { basketIds, DEFAULT_PREFS, usePrefs } from '@/store/prefs';
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
    usePrefs.getState().setLocation('77002', 'gulf');
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
