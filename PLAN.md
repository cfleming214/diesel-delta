# DieselDelta

## Overview

DieselDelta answers one deceptively simple question: when diesel prices fall, do grocery prices follow? Freight costs ride on diesel, and diesel moves fast — but supermarket shelf prices are famously sticky on the way down. DieselDelta tracks the national (and regional) diesel benchmark alongside a basket of everyday grocery items and renders the gap as a single, glanceable number: your Delta.

The app is built for one-tap clarity. Open it, see whether diesel is up or down over your chosen window, see whether your basket moved with it, and get a plain-English verdict: "Diesel fell 11% in 60 days. Your basket fell 0.4%. Someone kept the difference." Users can log their own receipt prices to personalise the basket, follow specific items, and set alerts for when a category finally breaks.

DieselDelta is deliberately non-partisan and data-first. It cites its sources, shows its methodology, and lets users export the chart as a shareable card — because the most viral product feature here is being right in public.

## Tech Stack

- **Expo (SDK 51+) with React Native and TypeScript** — managed workflow, EAS Build for iOS/Android, OTA updates for fast data-methodology fixes
- **Expo Router** — file-based navigation with typed routes and deep links into individual item pages
- **TanStack Query + Zustand** — server-state caching/offline persistence for price series, local store for user basket and preferences
- **Victory Native XL (Skia)** — performant dual-axis time-series charts and sparkline rendering at 60fps
- **Supabase (Postgres + Edge Functions) with Expo Notifications** — ingestion of public fuel and CPI/retail price feeds, user accounts, receipt storage, and push alerts

## Features

1. **The Delta Number** — A single headline metric comparing diesel price change against grocery basket change over a user-selected window (30/60/90/365 days), colour-coded for lag severity.
2. **Dual-Axis Lag Chart** — Overlay diesel and basket price indices on one normalised chart with an adjustable lag slider that shows how many weeks grocery prices trail fuel.
3. **Basket Builder** — Pick from ~120 tracked staples (milk, eggs, bread, chicken, rice, bananas) to build a personal basket; the index recalculates instantly and weights by your logged purchase frequency.
4. **Receipt Logger** — Snap or manually enter grocery prices with store and date; on-device OCR pre-fills line items so users build a private, personal price history.
5. **Category Breakdown** — Ranked list of which categories passed fuel savings through (produce, dairy, frozen) and which did not, with a per-category pass-through percentage.
6. **Break Alerts** — Push notifications when diesel crosses a threshold, when a followed item finally drops, or when the Delta widens past your set tolerance.
7. **Share Cards** — One-tap generation of a branded image card of your Delta and chart, sized for Instagram Stories, X, and Reddit.
8. **Methodology & Sources** — An always-accessible panel explaining data origins, index construction, smoothing, and known limitations, with direct links to the underlying public datasets.

## Key Screens

- **Today** — Hero Delta number, 7-day diesel sparkline, verdict sentence, and a prominent share button
- **Chart** — Full-screen dual-axis explorer with window selector, lag slider, and pinch-to-zoom scrubbing
- **Basket** — Editable list of tracked items with per-item change badges, drag-to-reorder, and add-item search
- **Log** — Receipt camera, manual entry form, and a chronological history of the user's own recorded prices
- **Insights** — Category pass-through ranking, regional comparison, alert settings, and the methodology panel

## Core Components

- **DeltaGauge** — Animated headline component rendering the gap value, directional arrow, severity colour ramp, and auto-generated verdict copy
- **LagChart** — Skia-backed dual-series chart with normalised axes, haptic scrub cursor, annotation pins, and lag-offset rendering
- **BasketItemRow** — Reusable row with sparkline, percent-change badge, follow toggle, and swipe-to-remove gesture
- **ShareCardRenderer** — Off-screen view-to-image capture pipeline producing multi-aspect-ratio branded export images

## Roadmap

### Week 1

- Scaffold Expo + TypeScript + Expo Router project, set up EAS Build profiles and CI lint/typecheck
- Stand up Supabase schema and a scheduled Edge Function ingesting public diesel and retail price series
- Build the Today screen with a static DeltaGauge and hardcoded fixture data

### Week 2-3

- Implement LagChart with Victory Native XL, window selector, and lag slider wired to live queries
- Ship Basket Builder, item search, follow toggles, and Zustand persistence with offline cache hydration
- Add Receipt Logger with camera capture, on-device OCR pre-fill, and manual correction flow

### Week 4+

- Launch Break Alerts via Expo Notifications with per-user threshold evaluation in an Edge Function
- Build ShareCardRenderer, Insights category pass-through ranking, and the methodology panel
- Add regional basket comparison, accessibility pass, and submit to App Store and Play Store

## Monetisation

DieselDelta runs a free core so the headline Delta is always public and shareable — that is the growth engine. **DieselDelta Pro** ($3.99/month or $24.99/year) unlocks unlimited custom baskets, full historical series beyond 12 months, regional and store-level breakdowns, unlimited break alerts, CSV/PNG export, and widget support. A one-time **Lifetime** tier at $59 serves power users and early supporters.

Secondary revenue comes from an **API & Data tier** for journalists, researchers, and newsletters who want programmatic access to the Delta index and pass-through metrics, priced from $49/month. No advertising and no selling of receipt data — the product's credibility depends on being seen as an impartial measuring instrument, and that trust is the asset worth protecting.