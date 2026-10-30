// Supabase Edge Function serving the admin dashboard (mock-server/admin/index.html?metrics=...).
// Secret: ADMIN_TOKEN. Uses the service role to read app_events and ingest_runs.
import { createClient } from 'npm:@supabase/supabase-js@2';

import type { EventRow, RunRow } from '../_shared/metrics.ts';
import { type AdminDb, createAdminHandler } from './handler.ts';

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
};

const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const db: AdminDb = {
  async eventsSince(sinceIso, limit) {
    const { data, error } = await supabase
      .from('app_events')
      .select('install_id, session_id, name, props, platform, occurred_at, received_at')
      .gte('received_at', sinceIso)
      .order('received_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as EventRow[];
  },
  async recentRuns(limit) {
    const { data, error } = await supabase
      .from('ingest_runs')
      .select('id, status, started_at, finished_at, rows_upserted, detail')
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as RunRow[];
  },
};

Deno.serve(createAdminHandler({ db, adminToken: env('ADMIN_TOKEN') }));
