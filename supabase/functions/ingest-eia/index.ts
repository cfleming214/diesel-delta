// Supabase Edge Function: pulls EIA weekly retail diesel and gasoline prices into
// public.fuel_prices_weekly. Scheduled weekly by supabase/schedule.sql.
// Secrets: EIA_API_KEY, INGEST_SECRET (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided).
import { createClient } from 'npm:@supabase/supabase-js@2';

import type { SeriesRef, WeeklyPrice } from '../_shared/eia.ts';
import { createHandler, type IngestDb } from './handler.ts';

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const db: IngestDb = {
  async listSeries() {
    const { data, error } = await supabase.from('fuel_series').select('area, kind, eia_series_id');
    if (error) throw error;
    return data as SeriesRef[];
  },
  async latestPeriod() {
    const { data, error } = await supabase
      .from('fuel_prices_weekly')
      .select('period')
      .order('period', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.period as string | undefined) ?? null;
  },
  async upsertPrices(rows: WeeklyPrice[]) {
    const { error } = await supabase
      .from('fuel_prices_weekly')
      .upsert(rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })), {
        onConflict: 'area,kind,period',
      });
    if (error) throw error;
  },
  async startRun() {
    const { data, error } = await supabase
      .from('ingest_runs')
      .insert({ job: 'ingest-eia' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as number;
  },
  async finishRun(id, status, rows, detail) {
    const { error } = await supabase
      .from('ingest_runs')
      .update({ status, rows_upserted: rows, detail, finished_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },
};

Deno.serve(
  createHandler({
    db,
    eiaApiKey: requireEnv('EIA_API_KEY'),
    ingestSecret: requireEnv('INGEST_SECRET'),
    fetchJson: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`EIA HTTP ${res.status}`);
      return res.json();
    },
  }),
);
