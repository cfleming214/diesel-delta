import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { AppState, Platform } from 'react-native';

import { getSupabase, supabaseConfigured } from '@/data/supabase';
import { MAX_PROPS_BYTES, type EventName, type EventProps } from '@/domain';

type Row = {
  occurred_at: string;
  install_id: string;
  session_id: string;
  name: EventName;
  props: EventProps;
  platform: string;
  app_version: string;
};

export interface TelemetrySink {
  send(rows: Row[]): Promise<void>;
}

/** Sends to the app_events table (Supabase or the mock backend). */
const supabaseSink: TelemetrySink = {
  async send(rows) {
    const { error } = await getSupabase().from('app_events').insert(rows);
    if (error) throw new Error(error.message);
  },
};

const INSTALL_KEY = 'dd.installId';
const FLUSH_AT = 20;
const FLUSH_EVERY_MS = 10_000;
const MAX_QUEUE = 500;

const sessionId = randomUUID();
const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
const appVersion = (Constants.expoConfig?.version ?? '0.0.0').slice(0, 32);

let sink: TelemetrySink | null = supabaseConfigured ? supabaseSink : null;
let installId: Promise<string> | null = null;
let queue: Row[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;

function getInstallId(): Promise<string> {
  installId ??= (async () => {
    const existing = await AsyncStorage.getItem(INSTALL_KEY).catch(() => null);
    if (existing) return existing;
    const id = randomUUID();
    await AsyncStorage.setItem(INSTALL_KEY, id).catch(() => {});
    return id;
  })();
  return installId;
}

/** Drops props that would exceed the size limit rather than losing the event. */
function boundedProps(props: EventProps): EventProps {
  return JSON.stringify(props).length <= MAX_PROPS_BYTES ? props : { truncated: true };
}

/**
 * Records an anonymous analytics event. Events are batched and sent in the background; nothing is
 * sent unless a backend is configured. Failures are retried with the next batch, never thrown.
 */
export function track(name: EventName, props: EventProps = {}) {
  if (!sink) return;
  void getInstallId().then((install_id) => {
    queue.push({
      occurred_at: new Date().toISOString(),
      install_id,
      session_id: sessionId,
      name,
      props: boundedProps(props),
      platform,
      app_version: appVersion,
    });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= FLUSH_AT) void flush();
    else timer ??= setTimeout(() => void flush(), FLUSH_EVERY_MS);
  });
}

/** Sends everything queued. Safe to call repeatedly. */
export function flush(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!sink || queue.length === 0) return flushing ?? Promise.resolve();
  flushing ??= (async () => {
    const batch = queue.splice(0, 100);
    try {
      await sink!.send(batch);
    } catch {
      // Keep the batch for the next attempt (newest events win if the queue overflows).
      queue = [...batch, ...queue].slice(-MAX_QUEUE);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Flush when the app goes to the background. */
AppState.addEventListener?.('change', (s) => {
  if (s === 'background' || s === 'inactive') void flush();
});

/** Test hook: swap the sink and clear state. */
export function __setTelemetrySink(next: TelemetrySink | null) {
  sink = next;
  queue = [];
  installId = null;
  if (timer) clearTimeout(timer);
  timer = null;
}

export const __sessionId = sessionId;
