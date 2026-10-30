/**
 * Anonymous product analytics events. Shared by the app, the mock backend and the app_events check
 * constraint (a test keeps the SQL in sync). Props never include ZIP codes, receipt contents or
 * device identifiers; location is at most a state.
 */
export const EVENT_NAMES = [
  'app_open',
  'screen_view',
  'onboarding_complete',
  'window_change',
  'scrub',
  'basket_add',
  'basket_remove',
  'basket_reorder',
  'item_view',
  'search',
  'barcode_scan',
  'receipt_logged',
  'share',
  'paywall_view',
  'purchase',
  'restore',
  'alert_toggle',
  'alert_delivered',
  'error',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = Record<string, string | number | boolean | null>;

/** Upper bound for a single event's serialized props (mirrors the SQL check). */
export const MAX_PROPS_BYTES = 1024;
