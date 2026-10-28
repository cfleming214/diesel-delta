# Handoff: DieselDelta mobile app (iOS-first, Expo)

## Overview
DieselDelta compares the regional diesel price index with the shelf prices of a user's grocery basket and reports the gap ("Delta") in percentage points. This package covers 11 screens: Onboarding (ZIP), Today, Chart explorer, Basket, Item detail + rollback ledger, Search/scan, Receipt log, Insights, Retailer scorecard, Share card, and Pro paywall. It also includes three alternative Today layouts and three navigation structures. Product specs are in the repo: `PLAN.md` and `FEATURES.md`.

## About the design files
The files in this bundle are **design references made in HTML**. They are prototypes that show the intended look and behavior. They are not production code to copy. Rebuild them in the target stack from `PLAN.md`: **Expo SDK 51+, React Native, TypeScript, Expo Router, TanStack Query + Zustand, Victory Native XL (Skia)**. The repo has no UI code yet, so there are no existing components to follow.

- `DieselDeltaApp.dc.html` is the whole app as one interactive prototype. It has props `todayLayout` (`number|lines|bars`), `navStyle` (`tabs5|tabs3|float`) and `initialScreen`. Open it in a browser.
- `DieselDelta Screens.dc.html` is a canvas that shows every screen side by side, plus the three Today variations (1a/1b/1c).
- To read the source: each `.dc.html` contains a template (HTML with `{{ }}` holes) followed by a `class Component` logic block. The logic block holds all fixture data, the series math and the state transitions.

## Fidelity
**High fidelity.** Colors, type, spacing, radii and copy are final and come from the Nocturne design system (tokens below). Match them exactly. The fixture data is realistic but invented. Replace it with Supabase/EIA data.

**Chosen direction (3a):** Today uses the 1b scrubbable chart layout; navigation uses the tabs5 bottom tab bar. Variants 1a and 1c and the float/tabs3 nav styles are reference only — do not implement them.

## Global layout
- Device reference: 402×874pt (iPhone 16 Pro class). The status bar safe area is 54pt, and the home indicator inset is 34pt.
- Screen ground: `radial-gradient(120% 55% at 0% 0%, #232532 0%, #161826 62%)`.
- Horizontal page padding is 20pt (24pt on Onboarding). Content starts 6pt below the safe area.
- Layouts are left-aligned. Headings sit flush left and never go above weight 500.
- Screen title (h2): Inter 28/1.12, weight 500, letter-spacing −0.015em. A 12pt subtitle sits under it in `neutral-400`.
- Section heading (h5): 16pt/500.
- All numbers use `font-variant-numeric: tabular-nums`.
- Minimum hit target is 44pt. Icon buttons are 44×44 with radius 8 and a 1px `divider` border (the secondary style).
- Each list row has a 1px bottom rule in `rgba(233,233,237,0.08)`. Rows are 52–64pt tall.

## Navigation
Root tabs show a tab bar. Pushed screens (item, search, share, paywall, retailers) hide it and show a 44pt back or close button at the top left. The stack works as push/pop.

- **tabs5 (chosen):** Today (gauge), Chart (chart-line-up), Basket (basket), Log (receipt), Insights (chart-bar).
  - The bar is full width, padded 6/6/28, with background `#161826` at 86% and `backdrop-filter: blur(16px)`.
  - A 1px top rule fades to transparent over 48pt at each end.
  - Each item is a 22pt icon over a 10pt label.
  - Active item: accent `#9184d9`, filled icon, and an 18×2 accent mark above the icon with an 8pt glow.
  - Inactive item: `neutral-400`.
- **tabs3 (1c):** Today, Basket, Search, Insights.
  - Chart opens from an "Open chart explorer" secondary button on Today.
  - Log opens from a receipt icon button in the Basket header.
- **float (1b):**
  - A floating pill inset 16pt from the sides and 26pt from the bottom, 58pt tall, radius 29.
  - Fill is surface `#232532` at 82% with an 18pt blur and `--shadow-md`.
  - Items are icons only. The active item shows a 4pt accent dot with a glow.
  - Next to the pill sits a 58pt circular search button with a 1px accent border.

## Screens

### Onboarding (ZIP)
- Brand row: gas-pump icon (20pt, accent) and "DieselDelta" (15/500).
- Placed 40pt lower: h1 34/1.1, −0.025em, reading "When diesel falls, do grocery prices follow?". Below it, a 15pt body line in `neutral-400`.
- ZIP field: `.input`, 48pt tall, 20pt text, 0.12em tracking, numeric keyboard, digits only, max 5.
- At 5 digits, a card appears with kicker "FUEL SERIES", the region name (for example "Gulf Coast (PADD 3)"), "State series: Texas retail diesel", and the current price.
- "Continue" is a primary button 50pt tall, pinned to the bottom. If tapped with fewer than 5 digits, show the error "Enter a 5-digit US ZIP code." in `accent-300` at 12pt.
- Footer: "Source: U.S. EIA weekly retail diesel. No account required."
- ZIP→region mapping in the prototype uses the first digit: 0/1/2 → East, 3/7 → Gulf, 4/5/6 → Midwest, 8 → Rocky, 9 → West. Production should use the real ZIP→PADD/state lookup table (FEATURES.md).

### Today: shared elements
- Header: "Today" with the subtitle "TX 77002 · Oct 26, 2026". On the right, Search and Share icon buttons.
- Window segmented control `.seg`, full width, 38pt tall: 30D / 60D / 90D / 1Y (default 90D). The selected option gets accent text and a 1px inset accent ring.
- Verdict copy is neutral, generated as: "Diesel {fell|rose} X% over {window}. Your basket {fell|rose} Y% over the same period, a gap of Z percentage points."
- Severity labels: under 1 → "In step"; 1–3 → "Moderate lag"; over 3 → "Wide gap".

### Today 1a: headline number
1. Kicker "DELTA · 90 DAYS" (11pt, 0.1em tracking, `accent-300`) with the severity in a `.tag-accent`.
2. Delta figure: 96pt/500, −0.045em, with `text-shadow: 0 0 36px` accent at 45%, followed by "pts" (20pt, `neutral-400`).
3. Two 6pt bar rows on `neutral-900` tracks:
   - Diesel: `neutral-400` fill.
   - Basket: accent fill with a 10pt glow.
   - Bar widths are relative to the larger absolute change. Under each bar: "$3.56 → $3.41 per gallon" or "$… → $… for 16 items" (12pt, `neutral-500`).
4. The verdict sentence at 15/1.5.
5. Card "Diesel, last 7 days" with the current price and a 130×40 accent sparkline (1.6pt stroke).
6. Primary button "Share this Delta", 48pt, with a share-network icon.

### Today 1b: scrubbable chart (chosen)
- Header row:
  - Left: kicker "GAP AT {date}" and the gap in 56pt.
  - Right: legend "Basket 99.7" (accent line) and "Diesel 95.6" (`neutral-400` line).
- Chart: 362×230 SVG, both series indexed to 100 at the window start.
  - Dashed grid (`divider`, dasharray 2 4) with 10pt `neutral-500` labels.
  - Gap fill between the series: accent at 14%.
  - Diesel line: 1.5pt `neutral-400`. Basket line: 2.2pt accent with a 6pt drop-shadow glow.
- Scrubbing: on pointer down or move, the cursor snaps to the nearest day. A vertical line in `neutral-600` marks it, with dots on both series. The header values update live. On pointer leave, the cursor returns to the latest day. In RN, add a haptic tick on each snap.
- Axis caption: "{start} · Drag to scrub · indexed to 100 · {end}".
- Below the chart: the verdict sentence and a "Share this chart" primary button.

### Today 1c: diverging bars
- Shared zero line at 62% of the width.
- Diesel bar: 34pt tall, `neutral-700`. Basket bar: accent with a 14pt glow. Both extend from the zero line.
- An outlined accent bracket labeled "Gap" spans the difference.
- The Delta figure sits at 72pt next to "points" and the severity.
- A "Not rolled back" card lists up to 3 Gouge Gap items from the basket. Each row shows "+$unreturned" in `accent-300` and opens Item detail.

### Chart explorer
- Header: "Chart" with a `.tag-neutral` scope tag on the right.
- Two segmented controls:
  - Series: Diesel / Gasoline.
  - Scope: U.S. / PADD / {state}. State scope is Pro; for free users it opens the paywall.
- Card containing:
  - Scrub date, "X pts gap" (22pt), and a right-aligned readout: "Basket $101.52 · 99.7" and "Diesel $3.41 · 95.6".
  - A 334×250 chart with the same styling as 1b.
- Window segmented control.
- Lag slider: 0–12 weeks, accent thumb.
  - Labels: "Lag: N weeks" and "Best fit {n} wks" (the lag with maximum Pearson correlation over 1Y).
  - The slider shifts the fuel series forward by N×7 days.
  - Helper text: "Shifts the diesel line forward to test how many weeks shelf prices trail fuel. Correlation at this lag: 0.xx."

### Basket
- Header: "Basket" with "16 items · weighted by purchase frequency". On the right: Edit/Done (secondary) and + (primary icon, opens Search).
- Delta card:
  - Kicker "BASKET DELTA" and a small segmented control 90D / 6M / 1Y (default 1Y).
  - "+$5.12" at 40pt, then "$96.40 → $101.52".
  - An 8pt split bar: fuel-attributable in `neutral-500`, no fuel link in accent, 2pt gap between.
  - Legend: "Fuel-attributable −$0.36" and "No fuel link +$5.48".
  - Prototype formula: fuelAttr = baseline × 0.12 × fuelPct. Production uses the per-item regression coefficients.
- Item rows (BasketItemRow), 64pt:
  - Name and size (15pt, ellipsized).
  - Below it, a verdict tag (10pt) and the store.
  - A 56×22 sparkline: accent stroke if Gouge Gap, `neutral-400` otherwise.
  - Price and 12-month % change.
  - A follow star: filled accent when followed, `neutral-500` outline otherwise.
- Edit mode adds a minus-circle (`accent-300`) that removes the item and shows the toast "{item} removed". Production also needs swipe-to-remove and drag-to-reorder (PLAN.md).
- Verdict tag styles:
  - Gouge Gap: `.tag-accent` (bg `#423a6a`, text `#f5f4ff`).
  - Sticky Price: `.tag-outline` (1px accent border, accent text).
  - Tracking Fuel: `.tag-neutral` (bg `#3f424d`, text `#f3f5fe`).

### Item detail + ledger
- Top: back button, then follow and share icon buttons.
- Meta line "Dairy · 1 gal · Kroger", h2 name, and a larger verdict tag (12pt, padding 4/12).
- Verdict explanation, for example: "Price rose twice while diesel climbed. Diesel has since fallen 13.6% with no price reduction."
- Three stat cards: Shelf price, Unreturned (`accent-300`), Diesel since last rise.
- 12-month dual-axis chart, 362×170:
  - Price as a 2pt accent step line with glow.
  - Diesel as a 1.4pt dashed `neutral-400` line.
  - Shaded "Fuel falling" band (`neutral-500` at 10%).
  - Hollow accent dots mark each price change.
  - Min/max labels for both axes.
- "Price changes" ledger, newest first. Each row shows "$3.67 → $3.89", "+6.4%", "Apr 6, 2026 · Diesel $3.95", and a tag:
  - "Fuel-correlated" and "Partial rollback" in `accent-300`.
  - "Rollback" in `neutral-300`.
- The "Sources" ghost button opens the Provenance sheet: Source, Captured, Method, Confidence, and the button "Report a correction with a shelf-tag photo".

### Search / scan
- Top row: back button, input (placeholder "Item, barcode or product link", with a search icon inset at 12pt), and a barcode primary icon button.
- Empty state: helper text and chips: heinz ketchup, milk, eggs, paper towels, Paste a link.
- Matching is word-AND over name, size, category and store. Production uses Typesense fuzzy search.
- If the input contains a URL, show "Resolved from retailer link" and the resolved item.
- Result rows: name, size, verdict tag, "$4.79 at Target", and an Add/Added toggle. Adding shows the toast "{item} added to basket".
- Scan mode: a 240pt camera area with an accent reticle (inset 48/40, glow) and a scan line.
- No-match message: "No tracked item matches "q"."

### Receipt log
- Header: "Log" with "Private to this device".
- Two 48pt actions: "Scan receipt" (primary) and "Enter manually" (secondary).
- Scan flow: viewfinder card → Capture → OCR line list with checkboxes ("Kroger · Oct 28", "N of 4 lines selected") → "Add N prices", which prepends to History and toasts.
- Manual form:
  - Item (required).
  - Price paid: decimal, must be greater than 0.
  - Store: select Kroger / Walmart / Target / Costco / Albertsons / Amazon.
  - Errors in `accent-300` at 12pt: "Enter an item name." and "Enter a price above $0."
  - Save shows the toast "Price saved".
- History rows: item, price, "Store · date", and a comparison against the listed price. "Matches listed price" is in `neutral-400`; any difference, such as "$0.20 above listed", is in `accent-300`.

### Insights
- Pass-through by category: 84pt label, 6pt bar, % value. Values: Produce 71, Bakery 33, Meat 24, Dairy 18, Dry goods 12, Frozen 9, Household 6.
- Delta by region: a `.table` with region, diesel %, and delta pts. The user's region is shown in `accent-300`.
- Break alerts: three toggles (46×28 track; on = `accent-800` bg with accent border and `accent-300` knob; off = `neutral-900` bg with `neutral-600` knob):
  - "Diesel crosses $3.25/gal"
  - "A followed item drops in price"
  - "Delta exceeds tolerance"
- Delta tolerance stepper: 1–15 pts, default 3.
- Link card: Retailer scorecard; Methodology and sources (opens a bottom sheet); DieselDelta Pro ("Free plan" or "Active").

### Retailer scorecard
- Explanation line under the title.
- Rows: a 44pt grade square (accent border if the rollback ratio is 45% or more, `neutral-700` otherwise), name, "N items tracked", and "64% rolled back".
- Tapping a row expands per-category bars (Produce, Dry goods, Frozen, Household). One row is open at a time.

### Share card
- Close button and title "Share card".
- Aspect segmented control: Story 9:16 (214×380), X 16:9 (340×191), Square (300×300).
- Card: radius 14, `--shadow-lg`, background `radial-gradient(120% 70% at 0% 0%, #353b80, #262a60 45%, #161826)`. This is the one saturated "presence" ground the design system allows.
- Card contents: DieselDelta kicker and window, the Delta number, the verdict, a mini chart, and a footer "As of {date} · {region} · EIA retail diesel, retailer shelf prices" plus short link "dd.app/d/7k2q".
- Actions: Save image (toast "Image saved to Photos") and Share (native share sheet).

### Pro paywall
- Kicker "DIESELDELTA PRO", h2 "More history, more baskets, local detail.", and "The headline Delta stays free and public."
- Six check-icon features (from PLAN.md).
- Plan radios, 60pt each: Yearly $24.99 ("$2.08/month, billed yearly", default), Monthly $3.99, Lifetime $59. Selected = accent border with an accent 10% tint.
- CTA "Start Pro · $24.99". Fine print: "No advertising. Receipt data is never sold. Cancel anytime in Settings."
- On purchase: set isPro, pop the screen, toast "Pro unlocked".

## Overlays
- **Bottom sheet:**
  - Backdrop is `neutral-900` at 65%; tapping it closes the sheet.
  - Panel: surface `#232532`, top radius 14, `--shadow-lg`, max 80% height.
  - 36×4 grabber in `neutral-700`, a close icon button, and key/value rows (11pt uppercase key in `neutral-400`, 14/1.5 value in `neutral-200`).
- **Toast:**
  - 112pt from the bottom, surface background, `--shadow-md`, check-circle icon in accent, 13pt text.
  - Auto-dismisses after 2.2s.

## State (Zustand + TanStack Query)
- Persisted: `zip`/region, `basket` (item ids, order, purchase weights), `followed`, `alerts` (3 booleans plus threshold), `tolerance`, `isPro`/plan, receipt `history` (on device only).
- UI: `window` (30|60|90|365), `scrubIndex`, `lagWeeks`, `series` (diesel|gas), `scope` (national|padd|state), `basketBaseline` (90D|6M|1Y), `editing`, `query`, `scanning`, `logMode`, `shareAspect`, `sheet`.
- Queries: daily fuel series per region and series type; basket index series; per-item verdict, ledger and price series; category pass-through; regional deltas; retailer scores.
- Derived values:
  - fuelPct and basketPct over the window.
  - Delta = basketPct − fuelPct (percentage points).
  - Indexed series = value / value[windowStart] × 100.
  - Best lag = argmax Pearson correlation over 0–12 weeks.

## Design tokens (Nocturne)
- **Colors:**
  - bg `#161826`, surface `#232532`, text `#e9e9ed`, accent `#9184d9`, divider = text at 16%.
  - neutral 100–900: `#f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31`
  - accent 100–900: `#f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741`
  - section: `#262a60`, glow `#353b80`
  - Use `accent-300` (not the base accent) for paragraph-size accent text. Never use pure black or white.
- **Type:** Inter 400/500 only. Scale 42/32/25/20/16/13; interface sizes 10–15. Headings use line-height 1.12 and −0.015em tracking.
- **Spacing (0.7 density):** 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4.
- **Radius:** 4 / 8 / 14.
- **Shadows:**
  - sm: `0 0 0 1px #3f424d`
  - md: `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)`
  - lg: `0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,.65)`
- **Buttons:** the primary button is a 1px accent outline on transparent, never a fill. Hover is accent at 12%, pressed is accent at 22%.
- **Focus:** 2px accent outline with a 2px offset.
- **Rules:** freestanding rules fade to transparent over 48pt at each end.

## Assets
- Icons: Phosphor (regular, plus fill for active tabs and stars). Use `phosphor-react-native`. Icons used: gas-pump, basket, gauge, chart-line-up, chart-bar, receipt, magnifying-glass, share-network, barcode, camera, pencil-simple, star, caret-left/right/up/down, x, plus, minus, minus-circle, check, check-square, square, check-circle, info, link, map-pin, storefront, book-open, star-four, download-simple, lock-simple.
- Font: Inter (`@expo-google-fonts/inter`, weights 400 and 500).
- No images. The camera views are placeholders for `expo-camera` and the barcode scanner.

## Files
- `DieselDeltaApp.dc.html`: the full interactive prototype (all screens, all logic and fixture data).
- `DieselDelta Screens.dc.html`: overview canvas (1a–1c variations and 2a–2j screens).
- `ios-frame.jsx`: the device bezel used for presentation only. Do not implement it.
- `styles.css`: the Nocturne token sheet and component classes (the source of every value above).
