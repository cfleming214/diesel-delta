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

## Kitchen sink

In development builds, open `dieseldelta://dev/kitchen-sink` (or `/dev/kitchen-sink` on web) to see every primitive for side-by-side review against `design/handoff/DieselDeltaApp.dc.html`.
