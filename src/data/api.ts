import { fixtureApi } from './fixtureApi';
import type { DataApi } from './types';

/**
 * The app's single data source. Fixtures until the Supabase implementation lands (Phase 4);
 * screens depend only on the `DataApi` interface.
 */
export const api: DataApi = fixtureApi;
