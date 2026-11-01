# Privacy answers (App Store privacy label and Play data safety)

These answers describe the app as built. Revisit them when a mocked service in `GO_LIVE.md` section 2 is replaced, especially purchases, crash reporting and OCR.

## What leaves the device

| Data | Where it goes | Why | Source |
| --- | --- | --- | --- |
| Random install ID, per-launch session ID | `app_events` | Counting active installs and sessions | `src/lib/telemetry.ts` |
| Event names and small props (screen, window, item ID, plan, state abbreviation, PADD region, error class) | `app_events` | Product analytics and diagnostics | `src/domain/events.ts` |
| Platform and app version | `app_events` | Diagnostics | `src/lib/telemetry.ts` |
| Fuel series requests (area code, fuel kind) | Supabase RPC | Loading prices | `src/data/supabaseApi.ts` |

## What never leaves the device

- The ZIP code. Only the state abbreviation and region go into events.
- Logged prices, receipt photos and receipt text.
- The basket, followed items and alert settings.
- Contacts, precise location, advertising IDs and device identifiers. None of these are requested.

The install ID is a random UUID kept in app storage. It is not derived from the device and resets on reinstall. There are no accounts and no sign-in. Events cannot be linked to a person.

## App Store Connect

- **Tracking:** No. The app doesn't link data with third-party data for advertising and doesn't share it with data brokers.
- **Data collected, not linked to the user, not used for tracking:**
  - **Usage Data → Product Interaction:** Analytics.
  - **Diagnostics → Crash Data / Other Diagnostic Data:** App Functionality. This covers the `error` events, and later the crash reporter.
  - **Location → Coarse Location:** Analytics. Declared conservatively for the state and region in events; no location permission is used.
  - **Identifiers → Device ID:** Analytics. Declared conservatively for the random install ID.
- **Purchases:** declare them only if the purchases provider chosen at go-live collects purchase history on our behalf. Store-processed payments alone are not declared.

## Play Console data safety

- **Data collected:** App activity (app interactions), App info and performance (crash logs, diagnostics), Approximate location (state only) and Device or other IDs (random install ID). All are collected for Analytics and App functionality, not shared and not optional.
- **Encrypted in transit:** Yes (HTTPS to Supabase).
- **Deletion:** there is no account to delete. Uninstalling resets the install ID. Retention of `app_events` is set at go-live; 13 months is suggested.

## Permissions

| Permission | Text shown | Used for |
| --- | --- | --- |
| Camera | "Diesel Data uses the camera to scan product barcodes and grocery receipts. Receipt photos are processed on this device." | Barcode search, receipt capture |
| Add to Photos | "Diesel Data saves share cards to your photo library." | Save image on the share screen |
| Notifications | System prompt, only when an alert is first turned on | Break alerts |
