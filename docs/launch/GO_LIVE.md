# Go-live checklist

Everything below is mocked or unconfigured in the repository today. Each item names the seam to replace, what "done" means, and how to check it. Items marked **Blocker** must be done before any public release.

## 1. Data

- [ ] **Blocker: grocery prices.** The catalog, basket series, item ledgers, provenance, category pass-through and retailer scorecard all come from fixtures (`src/data/fixtureApi.ts`, `src/data/fixtures/`). The app presents these as real shelf prices, so it must not ship with them.
  - Choose a source (retailer feeds, an affiliate API or a licensed dataset), add tables and ingest jobs alongside `fuel_prices_weekly`, and implement the remaining `DataApi` methods in `src/data/supabaseApi.ts`.
  - Done when `supabaseApi` no longer spreads `fixtureApi`.
- [ ] **Supabase project** (fuel data is already live-ready):
  - `supabase link`, then `supabase db push` to apply `supabase/migrations/`.
  - Secrets: `supabase secrets set EIA_API_KEY=… INGEST_SECRET=… ADMIN_TOKEN=…`.
  - `supabase functions deploy ingest-eia admin-metrics`.
  - Schedule the weekly ingest with `supabase/schedule.sql`, after replacing the placeholders.
  - Check: run ingest once by hand, then call `fuel_series_daily` for `R30`/`diesel`.
- [ ] **App environment:** set `EXPO_PUBLIC_DATA_SOURCE=supabase`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` per EAS environment (preview, production).
- [ ] **Load test against staging:** `npm run load -- --url https://<staging-ref>.supabase.co --key <anon key> --users 500`. Thresholds must pass. Use a staging project, because the run inserts real event rows.

## 2. Mocked services

| Service | Seam | Today | Replace with | Done when |
| --- | --- | --- | --- | --- |
| Receipt OCR | `OcrProvider` in `src/lib/ocr.ts` | Returns a canned Kroger receipt | On-device text recognition (keeps the "processed on this device" promise in the camera permission text) | A real receipt round-trips to line items on iOS and Android |
| Purchases | `PurchasesProvider` in `src/lib/purchases.ts` | In-memory mock with a delay | StoreKit / Play Billing through a provider such as RevenueCat; products `dieseldelta.pro.monthly`, `dieseldelta.pro.yearly`, `dieseldelta.pro.lifetime` (`PRODUCT_IDS`) | Sandbox purchase, cancel and restore work on both stores |
| Push alerts | `PushProvider` in `src/lib/push.ts` | Local notifications, evaluated on device when the app runs | Server-side evaluation after each ingest (Edge Function) plus Expo push tokens | An alert arrives with the app closed |
| Short links | `LinkService` in `src/lib/links.ts` | Hash-based `dd.app/d/xxxx`, not resolvable | A redirect service on the real domain | A printed link opens the live Delta |
| Crash reporting | `ErrorReporter` in `src/lib/errors.ts` | Anonymous `error` events plus dev console | Sentry (or similar), keeping messages out of analytics | A test crash appears with a symbolicated stack |
| Corrections | Item → Sources → "Report a correction" | Toast "Corrections open in a later update" | Upload plus moderation queue | A photo submission reaches the queue |

## 3. Builds and releases

- [ ] `eas init` to create the EAS project, and commit the project ID it writes to app config.
- [ ] **EAS Update:**
  - `npx expo install expo-updates`, then `eas update:configure`.
  - Build profiles already name their channels (`development`, `preview`, `production` in `eas.json`).
  - Pick a `runtimeVersion` policy so an update never reaches an incompatible binary.
  - Check these steps against the current docs (https://docs.expo.dev/eas-update/getting-started/) first: they were not reachable from the environment that wrote this list.
- [ ] Credentials: `eas credentials` for iOS distribution and the Android upload key.
- [ ] **Maestro on devices:**
  - Run `.maestro/` against a `preview` build on an iOS simulator and an Android emulator.
  - Then add an EAS Workflows job per the current EAS docs, so the flows run before every store build.
  - The flows have only been validated as YAML so far.
- [ ] `eas build --profile production` for both platforms, then `eas submit`.

## 4. Store and policy

- [ ] Fill in and publish `docs/launch/STORE_LISTING.md`, including screenshots at the required sizes.
- [ ] Enter the privacy answers from `docs/launch/PRIVACY.md` in App Store Connect and Play Console. Update them if any section 2 provider (purchases, crash reporting, OCR) collects more.
- [ ] Publish a privacy policy and support page, and set their URLs in both stores.
- [ ] Paste `docs/launch/APP_REVIEW.md` into the App Review notes.

## 5. Operations

- [ ] Host the admin dashboard (`mock-server/admin/index.html` is a static page). Open it with `?metrics=https://<ref>.supabase.co/functions/v1/admin-metrics&token=…`. Keep the token out of shared links.
- [ ] Alerting on `ingest_runs` failures. The dashboard shows them, but nobody is paged.
- [ ] Rotate `INGEST_SECRET` and `ADMIN_TOKEN` from their development values.
- [ ] Wire CI: move `ci/github-actions.yml` to `.github/workflows/`, which needs a token with the `workflow` scope. Add `npm run e2e:build && npm run e2e` (after `npx playwright install chromium`), `npm run load:test`, `npm run mock:test` and `npm run functions:test`.
