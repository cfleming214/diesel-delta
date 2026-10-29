import { fixtureApi } from './fixtureApi';
import { supabaseConfigured } from './supabase';
import { supabaseApi } from './supabaseApi';
import type { DataApi } from './types';

/**
 * The app's single data source, chosen at build time: live fuel prices from Supabase when
 * EXPO_PUBLIC_DATA_SOURCE=supabase and its URL/key are set, otherwise bundled fixtures.
 * Screens depend only on the `DataApi` interface.
 */
export const api: DataApi = supabaseConfigured ? supabaseApi : fixtureApi;
