import { PostgrestClient } from '@supabase/postgrest-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True when the build was configured to read live data from Supabase. */
export const supabaseConfigured =
  process.env.EXPO_PUBLIC_DATA_SOURCE === 'supabase' && !!url && !!key;

let client: PostgrestClient | null = null;

/**
 * Shared Supabase REST client. The app only calls RPCs and inserts events with the public anon
 * key, so it uses the PostgREST client alone rather than the full supabase-js client (whose auth,
 * storage and realtime clients added about 690 KB of source to the web bundle). It sends the same
 * headers supabase-js does without a session.
 */
export function getSupabase(): PostgrestClient {
  if (!url || !key)
    throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL/ANON_KEY)');
  client ??= new PostgrestClient(new URL('rest/v1', url.endsWith('/') ? url : `${url}/`).href, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return client;
}
