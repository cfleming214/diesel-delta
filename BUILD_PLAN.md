# DieselDelta — React Native + Expo Build Plan

This is the plan for building DieselDelta as an iOS-first Expo app. It draws on three sources:

- `PLAN.md`: the product, the stack and the roadmap.
- `FEATURES.md`: the verdict engine, the scraper, provenance and the other features.
- `design/handoff/`: the high-fidelity design handoff from the Nocturne design system. Its `README.md` is the screen-by-screen spec. `DieselDeltaApp.dc.html` is the interactive prototype, and it holds the fixture data and series math.

Where this plan says "per spec", the details (sizes, copy, colors) are in `design/handoff/README.md`. Match them exactly.

---

## 1. Scope decisions

| Decision | Choice | Why |
|---|---|---|
| Platform | iOS first, Android kept compiling | The handoff targets a 402×874pt iPhone 16 Pro. Android ships after the iOS build is stable. |
| Today layout | **1b, scrubbable chart** | This is the chosen direction (3a). Layouts 1a and 1c are reference only. |
| Navigation | **tabs5**: Today, Chart, Basket, Log, Insights | Chosen direction. The float and tabs3 styles are not built. |
| Theme | Dark only (Nocturne) | The design has no light mode. Set `userInterfaceStyle: "dark"`. |
| Accounts | None for v1 | Onboarding says "No account required". Supabase anonymous auth is enough for alerts and Pro entitlement. |
| Receipt data | On device only | Spec: "Private to this device". It is never uploaded. |
| Data until the backend is live | Port the prototype's fixture generator | Lets every screen be built and tested before Supabase/EIA is ready (see §6). |

**Out of scope for the app MVP** (backend workstream or later): the multi-retailer scraper, Typesense search, the server-side verdict engine and the API/journalist tier. The app talks to these through a typed API layer, so fixtures can be swapped for live data without touching the UI.

---

## 2. Tech stack

Use the **current stable Expo SDK** (SDK 58 / React Native 0.88 at project start). PLAN.md says "SDK 51+", and 51 is now old. Use the New Architecture, which is the default on recent SDKs. React Native 0.76+ is required for the `boxShadow` and `filter` style props that the glow effects rely on.

| Concern | Library |
|---|---|
| Framework | `expo`, TypeScript (strict) |
| Routing | `expo-router` with typed routes |
| Server state | `@tanstack/react-query`, with `@tanstack/query-async-storage-persister` for the offline cache |
| Client state | `zustand` with `persist` middleware on `react-native-mmkv` |
| Charts | `victory-native` (XL), `@shopify/react-native-skia`, `react-native-reanimated`, `react-native-gesture-handler` |
| Sparklines and small static charts | `react-native-svg`, which is cheaper than a Skia canvas per list row |
| Icons | `phosphor-react-native`, regular weight plus fill |
| Font | `@expo-google-fonts/inter` (400 and 500 only) |
| Blur and gradients | `expo-blur` for the tab bar. `expo-linear-gradient` for fading rules. Skia `RadialGradient` for the screen ground and the share card. |
| Haptics | `expo-haptics`: a selection tick on each scrub snap and toggle |
| Bottom sheet | Custom `Sheet` (`Modal` + Reanimated + Gesture Handler) — the spec is simple and avoids a third-party dependency on Reanimated internals |
| Camera and barcode | `expo-camera` (`CameraView` with `barcodeScannerSettings`) |
| Receipt OCR | `@react-native-ml-kit/text-recognition`, on device. Needs a dev build. |
| Share card | `react-native-view-shot`, `expo-sharing`, `expo-media-library` |
| Notifications | `expo-notifications` |
| Purchases | `react-native-purchases` (RevenueCat) for the Yearly, Monthly and Lifetime tiers. Needs a dev build. |
| Backend | `@supabase/supabase-js` |
| Builds and OTA | EAS Build, EAS Update, EAS Submit |
| Quality | ESLint (`eslint-config-expo`), Prettier, `tsc --noEmit`, Jest with `jest-expo`, `@testing-library/react-native`, Maestro for E2E |

> **Expo Go vs. dev build:** ML Kit and RevenueCat need native code, so build a development client (`eas build --profile development`) from week 1. Do not plan around Expo Go.

---

## 3. Project structure

```
src/app/                          # Expo Router (SDK 58 convention: routes live in src/app)
  _layout.tsx                     # fonts, providers (Query, GestureHandler, BottomSheet, Toast), gate on onboarding
  onboarding.tsx                  # ZIP entry
  (tabs)/
    _layout.tsx                   # custom tabs5 TabBar
    index.tsx                     # Today (1b)
    chart.tsx                     # Chart explorer
    basket.tsx
    log.tsx
    insights.tsx
  item/[id].tsx                   # Item detail + ledger (deep-linkable)
  search.tsx                      # Search / scan
  share.tsx                       # Share card (presentation: modal)
  paywall.tsx                     # Pro paywall (modal)
  retailers.tsx                   # Retailer scorecard
src/
  theme/                          # tokens.ts, typography.ts, shadows.ts
  ui/                             # primitives: Screen, Text, Button, IconButton, Seg, Tag, Card, Input,
                                  #   Toggle, Stepper, Radio, FadeRule, Toast, Sheet, KVRow
  components/                     # DeltaHeader, LagChart, Sparkline, BasketItemRow, BasketDeltaCard,
                                  #   PriceLedger, ItemPriceChart, CategoryBars, RegionTable,
                                  #   RetailerRow, ShareCard, ScanReticle, OcrLineList
  domain/                         # pure TS, no React: series math, delta, verdict copy, lag/correlation,
                                  #   basket attribution, formatting (money, sgn, dates)
  data/
    api.ts                        # typed query functions (fixtures or Supabase behind one interface)
    queries.ts                    # TanStack Query hooks + query keys
    fixtures/                     # ported prototype data: FUEL/GAS/BASK generators, CAT, RET, OCR0, HIST0
    supabase.ts
  store/                          # zustand: usePrefs (persisted), useUi (ephemeral)
  lib/                            # haptics, notifications, purchases, share, ocr
supabase/
  migrations/                     # schema
  functions/                      # ingest-eia, compute-verdicts, evaluate-alerts
design/handoff/                   # design reference (not shipped)
```

---

## 4. Design system translation (Nocturne → React Native)

Build this first. Every screen depends on it.

**`src/theme/tokens.ts`** copies `design/handoff/styles.css` exactly: colors (bg, surface, text, accent, neutral 100–900, accent 100–900, section, glow), spacing (2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4), radii (4 / 8 / 14) and the type scale.

How each CSS pattern maps to React Native:

| CSS in the prototype | React Native |
|---|---|
| `radial-gradient(...)` screen ground | A `<ScreenBackground>` Skia canvas with `RadialGradient`, absolutely filled behind every screen |
| `box-shadow` (sm/md/lg) | The `boxShadow` style prop (RN 0.76+, New Architecture). The 1px ring can also be a border. |
| `text-shadow` glow on figures | `textShadowColor`, `textShadowRadius` |
| `drop-shadow` glow on chart lines | Skia `<Shadow>` / `BlurMask` on the path |
| `backdrop-filter: blur(16px)` tab bar | `expo-blur` `BlurView` with an 86% `#161826` overlay |
| Fading 1px rules | `<FadeRule>`: a 1px `LinearGradient` (transparent → divider → transparent, 48pt ends) |
| `color-mix(... 16%)` divider | Precomputed rgba: `rgba(233,233,237,0.16)` |
| `font-variant-numeric: tabular-nums` | `fontVariant: ['tabular-nums']` in the base `<Text>` for all numbers |
| letter-spacing in em | Convert to pt: `letterSpacing = em × fontSize` (helper in `typography.ts`) |
| Primary button: outline, never a fill | `<Button variant="primary">`: 1px accent border, transparent. Pressed state is accent at 22% via `Pressable` style. |
| Focus ring | Not needed on touch. Keep accessibility labels and roles instead. |
| Minimum 44pt hit target | Enforced in `IconButton`, `Pressable` `hitSlop` |

**Rules to lint or check in review:** headings never above weight 500; Inter 400/500 only; `accent-300` (not the base accent) for paragraph-size accent text; no `#000` or `#fff`.

**Acceptance:** a hidden `/dev/kitchen-sink` route renders every primitive. It is compared side by side with the prototype open in a browser at 402pt width.

---

## 5. Navigation map

```
Root Stack (headerShown: false)
├── onboarding                      shown when prefs.zip is empty
├── (tabs)  — custom TabBar (tabs5)
│   ├── index     Today
│   ├── chart     Chart
│   ├── basket    Basket
│   ├── log       Log
│   └── insights  Insights
├── item/[id]     push, tab bar hidden, back button
├── search        push
├── retailers     push
├── share         modal, close button
└── paywall       modal, close button
```

- **Custom tab bar:** a 22pt icon over a 10pt label. The active tab uses the accent color, a filled icon, and an 18×2 accent mark with an 8pt glow. Padding is 6/6/28. Top rule fades over 48pt.
- **Deep links:** use the `dieseldelta://` scheme plus universal links for `dd.app/d/:code` (share cards) and `dd.app/i/:id` (items).
- **Toast:** one global host, 112pt from the bottom, auto-dismisses after 2.2s, driven by the `useUi` store.
- **Sheets** (Methodology, Provenance): `src/ui/Sheet` (drag down to dismiss). Backdrop is `neutral-900` at 65%, top radius 14, max 80% height, 36×4 grabber.

---

## 6. State and data layer

### Zustand

`usePrefs` is persisted with MMKV:
- `zip`, `regionKey`
- `basket`: `{ id, order, weight }[]`
- `followed: string[]`
- `alerts: { dieselCross, followedDrop, deltaTolerance }` and `dieselThreshold`
- `tolerance` (1–15, default 3)
- `isPro`, `plan`
- `receiptHistory` (on device only)

`useUi` is ephemeral:
- `window` (30|60|90|365, default 90)
- `scrubIndex`, `lagWeeks`
- `series` (diesel|gas), `scope` (national|padd|state)
- `basketBaseline` (90D|6M|1Y, default 1Y)
- `editing`, `query`, `scanning`, `logMode`, `shareAspect`, `sheet`, `toast`

Scrub state is a Reanimated shared value inside `LagChart`, so dragging never re-renders React. The header values are read through `useDerivedValue` + `runOnJS` (throttled to snap changes only).

### TanStack Query

| Key | Returns |
|---|---|
| `['fuel', region, series]` | Daily series (forward-filled) for ~455 days |
| `['basketIndex', basketHash]` | Daily basket value series |
| `['item', id]` | Item meta, verdict, ledger, 52-week price series, provenance |
| `['catalog', query]` | Search results |
| `['passThrough', region]` | Category percentages |
| `['regionalDeltas', window]` | Region rows |
| `['retailers']` | Grades, ratios and category breakdowns |

Use a `staleTime` of 6h for fuel (EIA is weekly) and 1h for item and basket data. Persist the cache to AsyncStorage so the app opens offline with the last data.

### `src/data/api.ts`

`api.ts` is one interface with two implementations: `fixtureApi` (ported from the prototype: the `interp`/`FK`/`BK` generators, `REGIONS`, `regSeries`, `CAT`, `ledgerOf`, `RET`, `OCR0`, `HIST0`) and `supabaseApi`. Switch between them with `EXPO_PUBLIC_DATA_SOURCE`. This lets phases 1–3 ship without a backend.

### `src/domain/` (pure, unit tested)

Port these from the prototype's logic block first, with tests:
- `pct`, `sgn`, `money`, `smoney`, date helpers (`fmtD`)
- `deltaFor(fuel, basket, window)` returns `{ fuelPct, basketPct, delta, severity }`. Severity is "In step" under 1, "Moderate lag" from 1 to 3, and "Wide gap" over 3.
- `verdictSentence(...)`: the exact copy template from the spec
- `indexSeries(values, start, lagDays)` returns the fuel and basket series indexed to 100 at the window start
- `pearson(a, b)` and `bestLag(fuel, basket, 0..12 weeks)`
- `basketAttribution(...)`: the prototype formula (`baseline × 0.12 × fuelPct`) behind an interface, so the per-item regression coefficients can replace it later
- `chartGrid(lo, hi)`: the step logic of 1/2/5 with 12% padding

---

## 7. Component inventory

| Component | Notes |
|---|---|
| `LagChart` | Victory Native XL `CartesianChart` with two `Line`s plus a custom Skia `Path` for the gap fill (accent at 14%). Dashed grid uses dasharray 2 4. Basket is a 2.2pt accent line with a glow; diesel is a 1.5pt `neutral-400` line. Takes `lagDays`. Scrubbing uses `useChartPressState`: snap to the nearest day, draw a `neutral-600` cursor line and two dots, fire a haptic tick on each new index, and reset to the latest day on release. Used on Today (362×230) and Chart (334×250). |
| `DeltaHeader` | Kicker "GAP AT {date}", the gap at 56pt, and a legend (Basket/Diesel index values). Values update live while scrubbing. |
| `ItemPriceChart` | A 362×170 Skia chart: step-line price (2pt accent with glow), dashed diesel line, a "Fuel falling" band, hollow change markers and min/max labels. |
| `Sparkline` | SVG path (130×40 on Today, 56×22 in rows). Uses `sparkPath` from domain. |
| `BasketItemRow` | 64pt row: name/size, verdict tag, store, sparkline, price, % change and follow star. Swipe-to-remove with `ReanimatedSwipeable`. Drag-to-reorder via `react-native-reorderable-list` (or `react-native-draggable-flatlist`). In edit mode, adds a minus-circle. |
| `BasketDeltaCard` | Kicker, baseline segmented control, +$ at 40pt, an 8pt split bar and a legend. |
| `PriceLedger` | Newest-first rows with tag colors per spec. |
| `ShareCard` | Fixed-size views for each aspect: Story 214×380, X 340×191, Square 300×300. Captured by `view-shot` at 3× (or a dedicated export size such as 1080×1920). |
| `ScanReticle` | Camera overlay with an accent reticle (inset 48/40, glow) and an animated scan line. |
| `Toggle`, `Stepper`, `Seg`, `Tag` (accent/outline/neutral), `Radio`, `KVRow` | Primitives in `src/ui` |

---

## 8. Screen build notes

Each screen is built against the fixture API first, then switched to live data.

1. **Onboarding:** a digits-only numeric input (max 5, 0.12em tracking). At 5 digits it shows the "FUEL SERIES" card. Continue is pinned above the keyboard (`KeyboardAvoidingView`), with an error message for fewer than 5 digits. Phase 1 uses the prototype's first-digit mapping. Phase 4 uses the real ZIP→PADD/state lookup (a bundled JSON of ~42k ZIPs, or a Supabase RPC).
2. **Today (1b):** header with Search and Share icon buttons, then the window segmented control, `DeltaHeader`, `LagChart`, the axis caption, the verdict and "Share this chart".
3. **Chart:** a scope tag, Series and Scope segmented controls (State is Pro and otherwise opens the paywall), a card with the scrub readout and chart, the window control, and a lag slider (0–12 weeks, via `@react-native-community/slider` or a custom Reanimated slider with an accent thumb). Below it: "Best fit N wks" and the correlation at the current lag.
4. **Basket:** an Edit/Done button and a + button (to Search), `BasketDeltaCard`, then the list of `BasketItemRow`s. Removing an item shows a toast.
5. **Item detail:** follow and share buttons, the meta line, the verdict tag and explanation, 3 stat cards, `ItemPriceChart`, `PriceLedger`, and a "Sources" button that opens the Provenance sheet.
6. **Search / scan:** an input with an inset icon and a barcode button. The empty state shows chips. Results use word-AND matching on fixtures. URL input shows "Resolved from retailer link". Scan mode uses `CameraView` with EAN-13/UPC-A/UPC-E barcode types. Add/Added toggles show a toast.
7. **Log:** Scan receipt and Enter manually buttons. Scan flow: viewfinder → `takePictureAsync` → ML Kit text recognition → line parser (item + price regex) → checkbox list → "Add N prices". The manual form (react-hook-form + zod) shows errors per spec. History compares each entry against the listed price.
8. **Insights:** category bars, the region table (user's region in `accent-300`), 3 alert toggles, the tolerance stepper (1–15), and link cards (Retailers, Methodology sheet, Pro status).
9. **Retailer scorecard:** expandable rows (one open at a time, using `LayoutAnimation` or Reanimated layout transitions) with per-category bars.
10. **Share card:** an aspect segmented control, the card on a radial "presence" background, Save image (needs MediaLibrary permission, then toast) and Share (`expo-sharing`).
11. **Paywall:** 6 features, 3 plan radios (Yearly is the default), and the CTA. On success, set `isPro`, dismiss and show the toast "Pro unlocked". The radios show prices from RevenueCat offerings. Fall back to the spec copy if offerings fail to load.

---

## 9. Backend (Supabase)

**Schema (v1):**
- `regions`: national, PADD 1–5 and states
- `zip_region`: zip → padd, state
- `fuel_prices`: region, series (diesel|gas), week, price
- `items`: canonical catalog with UPC, brand, size and category
- `item_prices`: item, store, zip_bucket, observed_at, price, promo flag. Sparse event log.
- `item_verdicts`: materialized nightly
- `price_changes`: ledger rows
- `provenance`: append-only
- `pass_through`, `retailer_scores`: materialized
- `push_tokens`, `alert_prefs`: anonymous user id

Row-level security: public read on market data. Write access only to the user's own token and alert rows.

**Edge Functions (scheduled with `pg_cron`):**
- `ingest-eia`: pulls the EIA API v2 petroleum weekly retail diesel and gasoline series (national, PADD and the state series EIA publishes) and forward-fills to daily.
- `compute-verdicts`: runs nightly at 04:00 UTC. Computes the lagged cross-correlation and asymmetry test per FEATURES.md, then refreshes the materialized views.
- `evaluate-alerts`: runs after ingest and verdicts. Evaluates diesel threshold crossings, followed-item drops and delta-over-tolerance, deduplicates per user, respects quiet hours, and sends through the Expo Push API.

**Grocery price source:** this is the largest unknown (see §12). For launch, start with fixtures and a manually curated set. Use BLS CPI Average Price Data as a public, citable baseline. Plan retailer feeds (affiliate/product APIs first) as a separate track.

---

## 10. Phased milestones

Each phase ends with a TestFlight build from EAS.

### Phase 0: Foundation (≈3 days)
- `create-expo-app` (TypeScript, Expo Router template), strict TS, path aliases (`@/`)
- ESLint, Prettier, Jest; GitHub Actions running `tsc`, `lint` and `test`
- `eas.json` with development, preview and production profiles; bundle ID; dev client build
- `app.json`: dark UI, scheme, camera, photo-library and notification permission strings
- Load fonts with the splash screen held until they are ready

**Done when:** the dev client runs on a device and CI is green.

### Phase 1: Design system + fixtures (≈4 days)
- `src/theme`, all `src/ui` primitives, `ScreenBackground`, `FadeRule`, Toast host, Sheet
- Port `src/domain` and `src/data/fixtures` from the prototype, with unit tests that check against prototype outputs. For example, the 90D delta for ZIP 77002 must match the prototype's numbers.
- Custom tabs5 TabBar and route skeletons

**Done when:** the kitchen-sink route matches the prototype, and domain tests pass.

### Phase 2: Core loop (≈1.5 weeks)
- Onboarding, Today (1b) with `LagChart` scrubbing and haptics, and the Chart explorer with the lag slider and best-fit lag
- Zustand persistence and TanStack Query on `fixtureApi`

**Done when:** scrubbing runs at 60fps on a physical device, and verdict copy and severity match the spec for all 4 windows.

### Phase 3: Basket, item, search (≈1.5 weeks)
- Basket with edit mode, swipe-to-remove, drag-to-reorder and follow
- Item detail with `ItemPriceChart`, the ledger and the Provenance sheet
- Search with word-AND matching, the URL-resolve stub and barcode scan

**Done when:** you can add from search, see the item in the basket, reorder it, open its detail, and remove it, and the Basket Delta recomputes each time.

### Phase 4: Backend + live data (≈2 weeks, in parallel with phase 3)
- Supabase schema and migrations, `ingest-eia`, the real ZIP→PADD/state table, `supabaseApi`
- Switch fuel series to live data. Keep item data on fixtures until a price source exists.
- Offline cache persistence

**Done when:** Today shows real EIA diesel for the user's region and opens offline with cached data.

### Phase 5: Log, Insights, Retailers (≈1.5 weeks)
- Receipt OCR flow with the line parser, the manual form with validation, and on-device history
- Insights (category bars, region table, toggles, stepper, Methodology sheet) and the Retailer scorecard

**Done when:** a photo of a real receipt yields editable lines and saved history survives an app restart.

### Phase 6: Alerts, share, Pro (≈1.5 weeks)
- `expo-notifications` permission flow, token registration, `evaluate-alerts`, deep link from a notification to the item
- Share card capture at the 3 aspects, Save to Photos, native share sheet, `dd.app` short links
- RevenueCat products, the paywall, entitlement gating (State scope, history beyond 12 months, multiple baskets), restore purchases

**Done when:** a sandbox purchase unlocks Pro, a test alert arrives and deep-links correctly, and the exported card is legible on Instagram Stories.

### Phase 7: Hardening + launch (≈1.5 weeks)
- Accessibility: VoiceOver labels on charts (summary text, plus `accessibilityActions` to step through days), Dynamic Type caps on hero numbers, contrast check of `accent-300` on surfaces
- Performance profiling (Hermes; FlashList if the basket grows past 40 rows), Sentry (`@sentry/react-native`), EAS Update channels
- Maestro E2E covering onboarding, scrubbing, add to basket, logging a receipt, sharing and the paywall
- App Store assets, privacy nutrition label (camera and photos used on device, no tracking), App Review notes for the subscription, then Android parity pass and Play submission

**Total: about 10–11 weeks for one engineer, or 6–7 weeks with a second engineer on the backend.**

---

## 11. Testing strategy

- **Unit tests** (Jest) for all of `src/domain`. These are the credibility layer, so aim for full branch coverage. Include golden tests against values produced by the prototype's JS.
- **Component tests** (RNTL): verdict copy, severity tag, form validation messages, edit-mode removal and the toast.
- **Visual check:** screenshot each screen in the iOS simulator at 402×874 and compare it with the prototype by eye during review. Add automated snapshot diffs later if UI drift becomes a problem.
- **E2E** (Maestro): runs on EAS Workflows or locally before each TestFlight build.

---

## 12. Risks and open questions

1. **Grocery price data source.** FEATURES.md describes scraping with residential proxies. That carries retailer Terms of Service and legal risk, and it would be a significant operation to run. A decision on sources (affiliate APIs, BLS, crowd-sourced receipts) is needed before phase 4 item data. The app is built to work with either.
2. **Methodology credibility.** The prototype's attribution formula (`× 0.12`) is a placeholder. A real regression model and a written methodology need sign-off before any "Gouge Gap" label goes public.
3. **Legal review of the "Gouge Gap" wording.** Naming retailers next to "gouge" may carry defamation risk. The provenance panel and the "A gap is not proof of intent" limitation help. Get legal review before launch.
4. **OCR quality.** ML Kit's line parsing of receipts varies by store, so plan time for parser heuristics per store format.
5. **Android visual parity.** `boxShadow` glow and blur render differently on Android. The fallback is Skia-drawn glows on the key elements.
6. **Victory Native XL limits.** The gap fill and the lag-shifted series need custom Skia paths inside the chart render function. Prototype `LagChart` in phase 1 to reduce this risk early.
