# Features

## Core Features

### Verdict Badge Engine
Every tracked product carries a single, plain-language verdict — **Tracking Fuel**, **Sticky Price**, or **Gouge Gap** — computed from the correlation between its price history and the regional diesel index over a rolling 18-month window. The badge is recalculated nightly and surfaces the exact date a price rose, the fuel level on that date, and whether fuel has since fallen without a corresponding rollback.

**User benefit:** Shoppers get an instant, non-technical answer to "was I ever given my money back?" without reading a chart or understanding regression analysis.

**Tech note:** Classification runs a lagged cross-correlation (0–120 day lag windows) between the item's price series and the EIA On-Highway Diesel series, plus an asymmetry test comparing upward pass-through elasticity to downward pass-through elasticity. Items with upward elasticity > 2x downward elasticity and a fuel decline > 15% since the last price increase are flagged **Gouge Gap**. Verdicts are cached in Postgres with a materialized view refreshed at 04:00 UTC.

### Daily Multi-Retailer Price Scraper
A distributed collection layer captures listed shelf and online prices daily for a curated catalog of high-frequency grocery and household items across Walmart, Amazon, Target, Kroger, Albertsons, Costco, and regional chains. Prices are captured per-store-ZIP where retailers expose localized pricing, so the dataset reflects what a real shopper in Tulsa sees versus one in Fresno.

**User benefit:** Users see real, verifiable prices from the stores they actually shop at, not national averages that hide local gouging.

**Tech note:** Headless Chromium workers on a rotating residential-proxy pool, orchestrated by Temporal with per-domain rate limits and politeness windows. Structured feeds (affiliate product APIs, retailer sitemaps, public JSON-LD) are preferred and used wherever available; scraping is fallback-only. Raw HTML snapshots are written to cold object storage for a 90-day dispute window so any disputed price point can be audited.

### Fuel Index Overlay Chart
Each product page renders a dual-axis time series: the item's price in dollars against the national or regional diesel/gas index, with shaded bands marking fuel spikes and declines. Users can toggle between national, PADD-region, and state-level fuel series, or swap diesel for retail gasoline and crude benchmarks.

**User benefit:** The claim "we raised prices because of fuel" becomes visually testable in two seconds — users can literally see the gap where the price never came back down.

**Tech note:** Server-rendered SVG with a lightweight canvas fallback for long ranges. Fuel series are ingested daily from EIA's public API (weekly diesel, daily spot) and interpolated to a daily grid with forward-fill; price series are stored as sparse event logs and densified at query time. Chart payloads are pre-aggregated per resolution (day/week/month) to keep p95 render under 400ms on mobile.

### One-Tap Item Search
A single search field resolves a typed query, barcode scan, or pasted product URL to a tracked item and returns its verdict badge immediately. Fuzzy matching handles brand variants, package sizes, and retailer-specific naming so "heinz ketchup" finds the 32oz bottle across all five chains.

**User benefit:** Zero learning curve — type what's in your cart, get the verdict, done.

**Tech note:** Typesense index over canonicalized product titles with embedded UPC/GTIN, brand, and size attributes. Barcode scanning uses the on-device BarcodeDetector API with a ZXing WASM fallback. Pasted retailer URLs hit a resolver service that extracts the retailer SKU and maps it to our canonical product ID via a maintained crosswalk table.

### Price Change Timeline & Rollback Ledger
For every item, a chronological ledger lists each discrete price change: old price, new price, percent delta, the fuel index on that date, and a tag indicating whether the move was fuel-correlated. A running "unreturned increase" counter tallies the cumulative dollar amount of increases that were never reversed despite subsequent fuel declines.

**User benefit:** Gives shoppers a receipt-like record they can screenshot, cite, or bring to a customer service line — turning a vague feeling into a documented number.

**Tech note:** Change detection uses a hysteresis filter (ignore moves under $0.03 or 0.5%) to suppress rounding noise and promo flicker. Promotional prices are detected via retailer sale flags and strikethrough markup and stored on a separate track so temporary discounts don't corrupt the base-price ledger.

### Basket Watchlist with Delta Alerts
Users build a watchlist of the 10–40 items they actually buy, and the app computes a single Basket Delta: what the basket cost at a chosen baseline date versus today, decomposed into fuel-attributable and non-fuel-attributable components. Push and email alerts fire when any watched item flips verdict or when the basket's Gouge Gap exceeds a user-set dollar threshold.

**User benefit:** Converts abstract inflation talk into one personal number — "your basket is up $14.20, and $11.60 of that has no fuel explanation."

**Tech note:** Basket aggregation is a weighted sum over per-item attribution coefficients derived from the same lagged regression used by the verdict engine. Alerts run on an event-driven consumer off the nightly recompute diff, with per-user dedup and a quiet-hours window stored in the notification preferences table.

## Secondary Features

### Retailer Scorecard
Each chain gets a public report card grading how consistently it rolls back fuel-driven increases across its tracked catalog. Scores break out by category — produce, dry goods, frozen, household — since cold-chain items have genuinely higher fuel exposure than shelf-stable ones.

**User benefit:** Lets shoppers pick where to spend based on pricing behavior, not just today's sticker price.

**Tech note:** Score is a category-weighted median of per-item rollback ratios, with a Bayesian prior to prevent small-catalog chains from topping the leaderboard on three data points. Published as a cached static page with a 24-hour TTL and an open JSON endpoint.

### Shareable Verdict Cards
Any item, basket, or retailer scorecard can be exported as a pre-formatted image card showing the overlay chart, the badge, and the unreturned-increase figure, sized for Instagram, X, and Reddit. Cards embed a short link back to the live, continuously updating product page.

**User benefit:** Makes the findings spreadable, which is the entire accountability mechanism — companies respond to visible pressure, not private spreadsheets.

**Tech note:** Satori + resvg render OG images server-side at request time with a CDN edge cache keyed on item ID and data version hash. Cards carry a visible "as of" timestamp and data-source footer so screenshots remain honest when they circulate weeks later.

### Regional Fuel Toggle
Users set a home ZIP and the entire app re-bases its fuel comparisons to the relevant PADD region and state-level retail diesel series. Verdicts, charts, and basket math all recompute against local fuel reality rather than a national average.

**User benefit:** A West Coast shopper isn't judged against Gulf Coast fuel prices, so the verdicts actually reflect their region's cost structure.

**Tech note:** ZIP-to-PADD and ZIP-to-state mappings are precomputed in a lookup table; verdict variants are materialized per region for the top 200 metros and computed on demand with a 1-hour cache elsewhere.

### Data Provenance Panel
Every price point and verdict links to a provenance drawer showing the source retailer, capture timestamp, collection method, and confidence flag. Users can file a correction with a photo of a shelf tag, which enters a moderation queue.

**User benefit:** Builds the trust a price-accountability tool requires — nobody should take a "Gouge Gap" badge on faith.

**Tech note:** Provenance records are immutable append-only rows keyed to each observation ID, with the 90-day HTML snapshot referenced by content hash. User corrections are triaged by an OCR pass on the submitted tag image, then human review before any series is amended; amendments are versioned, never overwritten.

## v2 Roadmap

- **Receipt Ingest & Auto-Basket:** Photo or email-forward a receipt to auto-populate a watchlist from actual purchases, and reconcile the price you paid against the listed price we captured that day — surfacing cases where shelf and register disagree.
- **Shrinkflation Detection:** Track net weight, count, and unit price alongside shelf price so a package that quietly drops from 16oz to 14oz registers as a price increase, with its own badge track and a per-ounce overlay against the fuel curve.
- **Open Data API & Journalist Tier:** A documented public API plus bulk CSV/Parquet exports of price and verdict history, with a free credentialed tier for newsrooms, researchers, and state consumer-protection offices, including webhook subscriptions for category-level anomaly events.
