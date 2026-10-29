-- Weekly schedule for the ingest-eia Edge Function. Run once in the SQL editor after deploying the
-- function and storing two Vault secrets:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the INGEST_SECRET function secret>', 'ingest_secret');
-- Kept out of migrations because it depends on per-project secrets.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- EIA publishes weekly retail prices on Monday afternoons (Eastern), or Tuesday after a Monday
-- holiday. Run Tuesday 14:17 UTC, then Wednesday as a catch-up; re-runs are idempotent upserts.
select cron.schedule(
  'ingest-eia',
  '17 14 * * 2,3',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/ingest-eia',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
