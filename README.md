# Diesel Data

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

## End-to-end tests

**Web (Playwright):** journeys for onboarding, chart scrubbing and lag, basket remove/swipe/reorder/add/follow, search and pasted links, item detail and provenance, receipt scan and manual entry, share card, paywall restore and purchase, alert settings, and telemetry reaching the admin metrics. They run against the exported web build talking to the mock backend:

```sh
npm run e2e:build   # web export pointed at the e2e mock (port 54331)
npm run e2e         # starts the mock + a static server, then runs e2e/tests
```

Playwright's Chromium must be installed (`npx playwright install chromium`) where it isn't already.

**Devices (Maestro):** the same journeys live in `.maestro/` and use the same accessibility labels. Install a build on a simulator or device (`npx expo run:ios|android`, or an EAS `preview` build) and run `maestro test .maestro`. Running them on EAS Workflows is on the go-live checklist.

## Stress tests

**Virtual users** (`load/`): each one is an app install that picks a state by population, then runs sessions that replay the app's real network calls:
- the fuel series RPC for onboarding, Today and Chart variants;
- batched `app_events` inserts, flushed at 20 events or every 10 s, as the app does.

Between actions it waits a random think time, and it repeats sessions until the run ends.

```sh
npm run mock:server                         # in one terminal
npm run load -- --users 500 --ramp 30 --duration 120
```

The run reports p50/p95/p99 per operation, throughput, error rate and journey completion. It checks them against thresholds (defaults: p95 < 500 ms, p99 < 1000 ms, errors < 1%, ≥ 99% of journeys complete) and writes JSON and Markdown to `load/reports/`. It exits 1 if a threshold fails. Watch it live on the admin dashboard.

To target a live project, pass `--url https://<ref>.supabase.co --key <anon key>` (or set `LOAD_URL` and `LOAD_KEY`). Every insert writes real rows, so use a staging project. `--seed` makes journeys reproducible.

**Browser users:** `npm run load:browsers -- --users 5` runs concurrent Chromium users through onboarding, Today, Chart and Basket against the e2e web build and its mock. It times each step against a p95 limit (`--p95-ms`, default 3000). The browsers share the machine running them, so keep `--users` near its core count.

## Price bot

`price-bot/` is a separate service that collects daily grocery prices for the 150-item catalog (`price-bot/catalog/items.csv`). Its design is in `PRICE_BOT_PLAN.md`, and `price-bot/README.md` covers usage. Today it runs against the mock server's simulated Kroger, Walmart and Amazon. The real adapters arrive in P3 and P4.

```sh
npm run bot -- run --dry-run                # one day against an in-process mock; touches nothing else
npm run mock:server                         # or: a standing mock in one terminal…
npm run bot -- simulate --days 30           # …then replay 30 days into it
npm run bot:test
```

## Admin dashboard

A live metrics dashboard for operators: active installs, events and API requests per minute, API latency (p50/p95), the activation funnel (open → ZIP → basket → share → Pro), installs by region, screen views, per-route latency and errors, EIA ingest runs and a feed of recent events. Every chart has a hover tooltip and a data table.

- **Mock:** with `npm run mock:server` running, open http://localhost:54321/admin?token=mock-admin. It updates every 2 seconds over server-sent events. Set `ADMIN_TOKEN` to change the token.
- **Live Supabase:** deploy the `admin-metrics` function and set its secret (`supabase secrets set ADMIN_TOKEN=…`), then open the same page with `?metrics=https://<ref>.supabase.co/functions/v1/admin-metrics&token=…`. It polls every 10 seconds. API latency figures come from the mock's request log, so they show as "–" against Supabase (use the Supabase dashboard's API reports there).

Metrics are computed by `supabase/functions/_shared/metrics.ts`, shared by the mock and the Edge Function, so both views agree.

## Telemetry

`track()` (`src/lib/telemetry.ts`) records anonymous product events (names in `src/domain/events.ts`) and sends them in batches to the `app_events` table when a backend is configured; otherwise it does nothing. Each event carries a random install ID (not a device or advertising ID), a per-launch session ID, platform and app version. Props never include ZIP codes, search text or receipt contents; location is at most a state. The table is insert-only for clients.

## Launch

`docs/launch/` holds the go-live checklist (`GO_LIVE.md`: every mocked service and how to replace it, plus Supabase, EAS and store steps), the store listing, the privacy label answers and the App Review notes. Build profiles publish EAS Update channels `development`, `preview` and `production` once `expo-updates` is configured.

## Kitchen sink

In development builds, open `dieseldata://dev/kitchen-sink` (or `/dev/kitchen-sink` on web) to see every primitive for side-by-side review against `design/handoff/DieselDeltaApp.dc.html`.
