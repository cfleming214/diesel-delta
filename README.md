# DieselDelta

When diesel falls, do grocery prices follow? An iOS-first Expo app. See `PLAN.md` (product), `FEATURES.md` (features), `BUILD_PLAN.md` (build phases) and `design/handoff/README.md` (screen spec).

## Stack

Expo SDK 58 · React Native 0.88 · TypeScript (strict) · Expo Router · Zustand · Reanimated 4 · Nocturne design tokens in `src/theme`.

## Getting started

```sh
npm install
npm start            # Metro; open in a development build (see below)
npm run web          # quick browser preview of the UI
```

Native modules planned for later phases (OCR, purchases) do not run in Expo Go, so use a development build:

```sh
npx eas-cli@latest build --profile development            # device
npx eas-cli@latest build --profile development-simulator  # iOS simulator
```

## Checks

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
```

The CI workflow is staged at `ci/github-actions.yml`. Move it to `.github/workflows/ci.yml` to enable it.

## Layout

| Path | Contents |
|---|---|
| `src/app` | Expo Router routes: `(tabs)` for Today, Chart, Basket, Log, Insights; stack routes for item, search, retailers, share, paywall, onboarding |
| `src/theme` | Nocturne tokens: colors, spacing, radii, type, elevations |
| `src/ui` | Primitives: Text, Screen, Button, IconButton, Seg, Tag, Card, Input, Toggle, Stepper, Sheet, Toast… |
| `src/components` | App components (TabBar, BackButton) |
| `src/domain` | Pure, unit-tested math: Delta, severity, verdict copy, correlation and lag, basket attribution |
| `src/data` | `DataApi` interface and the fixture implementation ported from the prototype |
| `src/store` | Zustand stores |

## Backend (Supabase + EIA)

Fuel prices come from the U.S. EIA weekly retail series, ingested into Supabase by the `ingest-eia` Edge Function. Grocery data still comes from bundled fixtures until a price source is chosen.

| Path | Contents |
|---|---|
| `supabase/migrations` | Fuel tables, `fuel_series_daily()` (forward-filled daily prices), RLS, and the 30 EIA series |
| `supabase/functions/ingest-eia` | Weekly ingest (Deno). Shared EIA logic in `supabase/functions/_shared/eia.ts` |
| `supabase/schedule.sql` | pg_cron job that calls the function Tue/Wed |
| `src/data/geo` | ZIP→state→PADD and the EIA series used for each state (bundled, works offline) |

Checks: `npm run db:check` (migrations against a scratch Postgres), `npm run functions:check` and `npm run functions:test` (needs [Deno](https://deno.com)).

Going live:

1. Create a Supabase project and get an EIA API key (https://www.eia.gov/opendata/register.php).
2. Apply the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Set function secrets: `npx supabase secrets set EIA_API_KEY=<key> INGEST_SECRET=<random string>`.
4. Deploy: `npx supabase functions deploy ingest-eia`.
5. Run it once to backfill three years: `curl -X POST -H "x-ingest-secret: <same string>" https://<ref>.supabase.co/functions/v1/ingest-eia`. The response and `ingest_runs` list any series that returned no rows.
6. Store `project_url` and `ingest_secret` in Vault and run `supabase/schedule.sql` in the SQL editor.
7. Point the app at it: copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_DATA_SOURCE=supabase` plus the project URL and anon key. For EAS builds, set the same variables in the EAS environment.

## Mock backend

`npm run mock:server` starts a local backend on http://localhost:54321 that speaks the same API as Supabase (the `fuel_series_daily` RPC, `app_events` inserts, the `ingest-eia` function run through the production handler against a mock EIA feed). Point the app at it to exercise the live data path with no accounts:

```sh
EXPO_PUBLIC_DATA_SOURCE=supabase EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key npm start
```

On a phone, use your computer's LAN address instead of `localhost`. `MOCK_LATENCY_MS`, `MOCK_JITTER_MS` and `MOCK_ERROR_RATE` simulate slow or failing networks. Tests: `npm run mock:test`.

## Telemetry

`track()` (`src/lib/telemetry.ts`) records anonymous product events (names in `src/domain/events.ts`) and sends them in batches to the `app_events` table when a backend is configured; otherwise it does nothing. Each event carries a random install ID (not a device or advertising ID), a per-launch session ID, platform and app version. Props never include ZIP codes, search text or receipt contents; location is at most a state. The table is insert-only for clients.

## Kitchen sink

In development builds, open `dieseldelta://dev/kitchen-sink` (or `/dev/kitchen-sink` on web) to see every primitive for side-by-side review against `design/handoff/DieselDeltaApp.dc.html`.
