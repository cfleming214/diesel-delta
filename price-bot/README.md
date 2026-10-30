# Price bot

The separate service that collects daily prices for the canonical catalog. The design is in `../PRICE_BOT_PLAN.md`.

## Catalog

`catalog/items.csv` holds the 150 item specs. `catalog.ts` loads and validates it, and `npm run bot:test` checks it.

| Column | Meaning |
| --- | --- |
| `id` | Stable item ID. The 22 IDs from the app's fixtures are kept, so saved baskets and follows survive. |
| `name`, `category` | Display name, and one of the 11 categories in `catalog.ts`. |
| `size_qty`, `size_unit` | Target size. Units: `oz`, `lb`, `fl_oz`, `gal`, `qt`, `l`, `ml`, `ct`, `roll`, `each`, `sq_ft`. |
| `priced_by` | `package`, `lb` (sold by weight; size must be 1 lb) or `each` (by the piece; size must be 1 each). |
| `size_tolerance` | Allowed size difference when matching a retailer product, from 0 to 0.25. |
| `brand_policy`, `brand` | `national` pins `brand`. `cheapest_comparable` allows store brands. |
| `ref_price` | An approximate U.S. shelf price. Only the mock retailers and the first validation bands use it. |
| `bls_series_id` | BLS Average Price series for cross-checks. These are from memory and are unverified until the BLS adapter fetches them (P6). |
| `in_default_basket` | `1` for the app's default basket. |

Retailer GTINs and SKUs are not in the catalog. They are matched per retailer, reviewed, and stored in `item_identifiers`.

## Running

```sh
npm run bot -- run [--day 2026-10-30] [--sources mock-kroger,mock-walmart] [--discover] [--workers 4] [--dry-run]
npm run bot -- simulate --days 30 [--end 2026-10-30]
npm run bot -- report [--days 30] [--end 2026-10-30] [--out dir] [--no-pdf]
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The local mock server (`npm run mock:server`) | Where the bot writes. It needs the service role. |
| `BOT_CONTACT_URL` | `https://dd.app/bot` | Sent in the User-Agent (`DieselDeltaPriceBot/0.1 (+url)`). Point it at a real page that explains the bot before any live source runs. |
| `BOT_RAW_DIR` | `price-bot/.data/raw` | Raw responses, purged after 90 days. Production should use object storage. |
| `MOCK_RETAIL_URL` | `SUPABASE_URL` | Where the simulated retailers live. |

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

## Printable report

`npm run bot -- report` reads what the bot collected for a period (default: the 30 days ending today) and writes `price-report-<end>.html` and `.pdf` (US Letter, through Chromium) to `price-bot/.data/reports/`.

It contains:
- **Summary:** a written summary, plus tiles for prices collected, coverage, held prices, each retailer's basket and U.S. diesel.
- **Basket index chart:** the default-basket items every retailer carries, priced at the median across stores and indexed to 100, with a weekly table.
- **Retailers:** a scorecard and the basket cost by region.
- **Categories:** average change by category.
- **Biggest movers:** the largest increases and decreases.
- **Shrinkflation:** package-size reductions.
- **Data quality:** held prices by reason, and the daily runs.
- **Appendix:** a price table for all 150 items, with the cheapest retailer in bold.

A report built from mock sources carries a "Simulated data" banner.

To produce one locally:

```sh
npm run mock:server                          # terminal 1
npm run bot -- simulate --days 30 --end 2026-10-30
npm run bot -- report --days 30 --end 2026-10-30
```
