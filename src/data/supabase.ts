import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True when the build was configured to read live data from Supabase. */
export const supabaseConfigured =
  process.env.EXPO_PUBLIC_DATA_SOURCE === 'supabase' && !!url && !!key;

let client: SupabaseClient | null = null;

/** Shared client. The app reads public market data only, so no session is stored. */
export function getSupabase(): SupabaseClient {
  if (!url || !key)
    throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL/ANON_KEY)');
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
