import { beforeEach, describe, expect, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createMockPurchases } from '@/lib/purchases';

describe('mock purchases provider', () => {
  beforeEach(() => AsyncStorage.clear());

  test('offers the three plans with store product IDs', async () => {
    const offers = await createMockPurchases(0).getOfferings();
    expect(offers.map((o) => [o.key, o.price, o.productId])).toEqual([
      ['year', '$24.99', 'dieseldelta.pro.yearly'],
      ['month', '$3.99', 'dieseldelta.pro.monthly'],
      ['life', '$59', 'dieseldelta.pro.lifetime'],
    ]);
  });

  test('a purchase is remembered by the store account and restorable', async () => {
    const store = createMockPurchases(0);
    expect(await store.restore()).toEqual({ plan: null });
    expect(await store.purchase('month')).toEqual({ plan: 'month' });
    expect(await createMockPurchases(0).restore()).toEqual({ plan: 'month' });
  });
});
