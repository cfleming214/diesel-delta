# Price bot

The separate service that collects daily prices for the canonical catalog. The design is in `../PRICE_BOT_PLAN.md`.

## Catalog

`catalog/items.csv` holds 176 item specs: 168 shelf items and 8 fuels. `catalog.ts` loads and validates it, and `npm run bot:test` checks it. Fuels (gasoline grades, diesel, heating oil, electricity, piped gas) are BLS benchmarks only: `loadCatalog()` leaves them out, so retailer collection, the mock retailers, reports and the app's product list never see them. Only the `bls` command loads them, with `loadCatalog({ benchmarks: true })`.

| Column | Meaning |
| --- | --- |
| `id` | Stable item ID. The 22 IDs from the app's fixtures are kept, so saved baskets and follows survive. |
| `name`, `category` | Display name, and one of the 12 categories in `catalog.ts` (11 grocery categories plus `Fuel`). |
| `size_qty`, `size_unit` | Target size. Units: `oz`, `lb`, `fl_oz`, `gal`, `qt`, `l`, `ml`, `ct`, `roll`, `each`, `sq_ft`, and `kwh` and `therm` for utility fuels. |
| `priced_by` | `package`, `lb` (sold by weight; size must be 1 lb) or `each` (by the piece; size must be 1 each). |
| `size_tolerance` | Allowed size difference when matching a retailer product, from 0 to 0.25. |
| `brand_policy`, `brand` | `national` pins `brand`. `cheapest_comparable` allows store brands. |
| `ref_price` | An approximate U.S. shelf price. Only the mock retailers and the first validation bands use it. |
| `bls_series_id` | The national BLS Average Price series for the same product, used for history and cross-checks. 59 items are mapped, to 57 series; `npm run bot -- bls` checks each one against BLS (see [BLS benchmark](#bls-benchmark)). |
| `in_default_basket` | `1` for the app's default basket. |

Retailer GTINs and SKUs are not in the catalog. They are matched per retailer, reviewed, and stored in `item_identifiers`.

### BLS products

The app's products are BLS Average Price products: the 60 with a current U.S. price (52 food, 5 gasoline, 3 household fuels). Retailers are tracked under a product through the catalog items whose `bls_series_id` points at it, so one product can have several specs: `FJ1101` (low-fat and skim milk) has `milk2` and `milk_skim`. In the database the link is `items.bls_item_code`, and `bls_product_items` lists the specs under each product.

`catalog/bls_products.csv` holds the curated name and category of each product (BLS's own names read like "Milk, fresh, whole, fortified, per gal. (3.8 lit)"), plus an optional `unit_label` override. `npm run bot:test` checks that every mapped product has a row. Current products with no catalog item are BLS-only: the fuels, and lemons, iceberg lettuce and romaine, which BLS prices per pound and the catalog sells by the each.

## Running

```sh
npm run bot -- run [--day 2026-10-30] [--sources mock-kroger,mock-walmart] [--discover] [--workers 4] [--dry-run]
npm run bot -- simulate --days 30 [--end 2026-10-30]
npm run bot -- report [--end 2026-10-30] [--out dir] [--no-pdf]
npm run bot -- bls [--dry-run]
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The local mock server (`npm run mock:server`) | Where the bot writes. It needs the service role. |
| `BOT_CONTACT_URL` | `https://dd.app/bot` | Sent in the User-Agent (`DieselDataPriceBot/0.1 (+url)`). Point it at a real page that explains the bot before any live source runs. |
| `BOT_RAW_DIR` | `price-bot/.data/raw` | Raw responses, purged after 90 days. Production should use object storage. |
| `MOCK_RETAIL_URL` | `SUPABASE_URL` | Where the simulated retailers live. |
| `BLS_URL` | `https://download.bls.gov` | Where `bls` reads the BLS files. With `--dry-run` it reads the mock's copy. |

- **`--dry-run`:** starts a mock server inside the process, so nothing outside it is touched.
- **`simulate`:** replays past days and refuses any source that isn't a mock retailer. Because the retailers are simulated, it skips the politeness wait and raw capture, and carries each day's prices to the next run in memory. A year takes about 15 minutes. Give the mock server more memory for a year (`NODE_OPTIONS=--max-old-space-size=8192`), because it holds about 1.1 million rows.
- **What runs:** a source runs only if it has an adapter and its `sources.enabled` flag is on. Page sources also need `legal_approved_at`.

## How a run works

`pipeline.ts`, one run per day:

1. **Sync:** syncs the catalog to `items`, and each retailer's sampled stores to `stores`.
2. **Discover:** on a retailer's first run, or with `--discover`, it matches the retailer's listings to catalog items (`match.ts`).
   - At ≥ 0.9 confidence the match is approved.
   - Between 0.6 and 0.9 it waits for review.
   - Below 0.6 it's dropped.
   - Human decisions on existing identifiers are never overwritten.
3. **Queue:** queues one fetch per batch of up to 50 approved SKUs per store (or online) in `price_tasks`.
4. **Fetch:** workers claim tasks with `claim_price_tasks`. Every request goes through `http.ts` (PoliteHttp), which handles:
   - the User-Agent and robots.txt;
   - a minimum interval per host;
   - backoff on 429 and 5xx;
   - the kill switch, re-read every 5 s;
   - raw-response capture.

   A 401, a 403 or a challenge page disables the source instead of retrying.
5. **Normalize and validate** (`normalize.ts`):
   - It works out unit prices and keeps promo prices separate.
   - It holds out-of-band prices (a misplaced decimal) and moves over 40% for review in `review_queue`.
   - A package size change on the same SKU is published and recorded in `price_events` as `size_change`.
6. **Load:** upserts `price_observations`, one row per item × retailer × store × day × source, so re-running a day updates it. The run summary goes in `ingest_runs`.

## BLS benchmark

`npm run bot -- bls` loads [BLS Average Price Data](https://www.bls.gov/cpi/factsheets/average-prices.htm): monthly all-outlet average prices, public domain. These are not a retailer's prices. They provide history from before the bot started collecting, and a reference to check the bot's own prices against.

- **What it loads:** for every product with a current U.S. price, every product the catalog maps, and every product already in `bls_products`: the national series plus each of the four Census-region series that exists (Northeast, Midwest, South, West). It writes one `bls_products` row per product, with its unit in base units (`base_qty`, so a retailer's `unit_price × base_qty` is its price in BLS's unit) and the regions current in the latest month. A product BLS stops publishing keeps its row and history with `current = false`. It keeps the full history, which goes back to the 1970s and 1980s for many items. That comes to about 295 series and 114,000 monthly prices, written to `bls_series` and `bls_prices`. `bls_series.unit_qty` and `unit` say what one BLS price buys (1 lb, ½ gal, 12 ct, 1 kWh, ...). `blsPriceForSize()` in `adapters/bls.ts` scales a BLS price to an item's package size.
- **Requests:** five bulk files from `download.bls.gov/pub/time.series/ap/` (`ap.item`, `ap.series`, `ap.data.3.Food`, `ap.data.2.Gasoline` and `ap.data.1.HouseholdFuels`, about 15 MB), fetched through PoliteHttp 5 s apart. The `bls-ap` source starts enabled, because the data is public domain and its kill switch still applies.
- **When to run it:** monthly, after BLS publishes the CPI (around mid-month). Re-running upserts.
- **Mapping checks:** every run reports catalog mappings that are `missing` from BLS, `stale` (BLS stopped publishing them), or in a `unit` that can't be compared with the item's size. These are listed in the summary and in `ingest_runs.detail`, and they don't fail the run. `bls.test.ts` runs the same check offline against the real BLS metadata in `mock-server/fixtures/bls/`.
- **Regional gaps:** BLS stopped many regional series after October 2025, during the lapse in appropriations. In the September 2026 release, all 60 national series are current, but only 30–53 regional series per region are (Northeast 30, Midwest 33, South 53, West 38). October 2025 is missing from every series.

To refresh the fixtures after changing mappings, replace `mock-server/fixtures/bls/ap.item` and `ap.series` with BLS's files, keeping only areas `0000`–`0400` (`ap.series` has its titles blanked to keep it small).

## Printable report

`npm run bot -- report` writes `price-report-<end>.html` and `.pdf` (US Letter, through Chromium) to `price-bot/.data/reports/`. It compares prices on the end day (default today) with 30 days and 1 year earlier.

National prices are the median across a retailer's sampled stores. They come from `item_prices_on()` and `basket_daily()`, so a year of raw rows is never downloaded. Only the last 30 days of observations are read, for store-level detail.

It contains:
- **Summary:** a written summary, plus tiles with each retailer's basket and U.S. diesel, each showing 30-day and 1-year change.
- **Changes at a glance:** a table of the baskets, the average item at each retailer and diesel, each now, 30 days ago and 1 year ago.
- **Basket index charts:** one over the past year (with a daily cost table) and one over the last 30 days. The basket is the default-basket items every retailer carries.
- **Retailers:** a scorecard with 30-day and 1-year basket change, and the basket cost by region.
- **Categories:** 30-day and 1-year change by category.
- **Biggest movers:** the largest rises and falls over 30 days and over the year.
- **Shrinkflation:** package-size reductions over the past year.
- **Data quality:** held prices and the daily runs for the last 30 days, plus a summary for the year.
- **Appendix:** a price table for all 168 shelf items, grouped by category, with 30-day and 1-year change.

With less than a year of history, the 1-year figures show "—" and the report says when they will be available. A report built from mock sources carries a "Simulated data" banner.

To produce one locally with a simulated year (about 3 minutes):

```sh
NODE_OPTIONS=--max-old-space-size=8192 npm run mock:server     # terminal 1
npm run bot -- simulate --days 365 --end 2026-10-30
npm run bot -- report --end 2026-10-30
```
