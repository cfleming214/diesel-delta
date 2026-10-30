import AsyncStorage from '@react-native-async-storage/async-storage';

import { PLANS, type PlanKey } from '@/data';

export type Offering = {
  key: PlanKey;
  name: string;
  sub: string;
  /** Localized price from the store. */
  price: string;
  productId: string;
};

export class PurchaseCancelledError extends Error {
  constructor() {
    super('Purchase cancelled');
  }
}

/**
 * In-app purchases. The mock simulates a store account on this device; the production provider
 * wraps RevenueCat (react-native-purchases, needs a dev build) with the same product IDs.
 */
export interface PurchasesProvider {
  getOfferings(): Promise<Offering[]>;
  /** Resolves with the active plan, or throws PurchaseCancelledError. */
  purchase(plan: PlanKey): Promise<{ plan: PlanKey }>;
  /** The plan the store account already owns, if any. */
  restore(): Promise<{ plan: PlanKey | null }>;
}

const PRODUCT_IDS: Record<PlanKey, string> = {
  year: 'dieseldelta.pro.yearly',
  month: 'dieseldelta.pro.monthly',
  life: 'dieseldelta.pro.lifetime',
};

/** Simulated store account; survives app data being reset, like an App Store account would. */
const ACCOUNT_KEY = 'dd.mockStoreAccount';
const STORE_LATENCY_MS = 400;

export function createMockPurchases(latencyMs = STORE_LATENCY_MS): PurchasesProvider {
  const wait = () => new Promise((r) => setTimeout(r, latencyMs));
  return {
    async getOfferings() {
      return PLANS.map((p) => ({ ...p, productId: PRODUCT_IDS[p.key] }));
    },
    async purchase(plan) {
      await wait();
      await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify({ plan }));
      return { plan };
    },
    async restore() {
      await wait();
      const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
      return { plan: raw ? (JSON.parse(raw) as { plan: PlanKey }).plan : null };
    },
  };
}

export const purchases: PurchasesProvider = createMockPurchases();
