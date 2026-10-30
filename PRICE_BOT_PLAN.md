# DieselDelta Price Bot — Design and Build Plan

This plan covers a separate service, the **price bot**, that collects shelf and online prices for 150 everyday items from the top U.S. grocery retailers. It writes them to the app's Supabase database. It replaces the fixture grocery data, which `docs/launch/GO_LIVE.md` lists as the launch blocker.

It builds on "Daily Multi-Retailer Price Scraper" in `FEATURES.md` and the price-source risk in `BUILD_PLAN.md` §12. It changes course from those in three places, each explained below:

1. **Official APIs and licensed data come first, and scraping is the exception.** Each scraped source needs legal sign-off before it is enabled.
2. **No rotating residential proxies, and no workarounds for bot protection.**
3. **A Postgres job queue instead of Temporal.**

---

## 1. Goals

- **Coverage:** 150 canonical items × 6 retailers. Prices are per store location where the retailer exposes local pricing, and online otherwise.
- **Freshness:** daily for every source (decided). EIA fuel data is weekly, but daily prices make promos and price changes sharper. A source that misses a day is filled forward and flagged stale after 3 days.
- **Trust:** every price is traceable to a source, a capture time, a method and a match confidence. This is what the app's Provenance sheet shows.
- **Quality bars:**
  - ≥ 90% of item × retailer cells filled each week.
  - ≥ 98% match precision on the audited sample.
  - No price published that fails validation.
- **Separate from the app:** the bot is its own deployable. It writes to the database through a service role, and the app only reads views and RPCs.

**Not goals for v1:**
- Every store in the country. Sampled stores per region are enough for regional verdicts.
- Alcohol and tobacco. Prices are age-gated, and state law varies.
- Pharmacy items behind a prescription.
- Copying product images or descriptions. Only price facts and identifiers are stored.

---

## 2. Ground rules for collection

These are design constraints, not afterthoughts. Retailer terms of service commonly restrict automated access, and the app publicly names retailers next to "Gouge Gap". Data that was collected improperly would undermine the product's credibility and create legal exposure.

1. **Source priority:**
   1. An official API the retailer offers.
   2. A licensed data feed.
   3. A public structured feed: sitemaps, JSON-LD on public pages, or BLS.
   4. Page collection.

   Tier 4 is used only where the site's terms permit it and counsel has signed off on that source.
2. **Respect robots.txt and published rate limits.** Default politeness is ≤ 1 request every 5 s per host, a nightly window, and a backoff on 429 or 503.
3. **Identify the bot honestly.** Use a stable User-Agent with a contact URL. Run from fixed egress IPs, with no rotating residential proxies and no fingerprint spoofing.
4. **Never bypass access controls.** No logins, no CAPTCHA solving, no circumventing bot protection. If a source starts blocking, the bot pauses that source, alerts, and the source moves to a licensed feed instead.
5. **Store the minimum:**
   - Store the price, regular or promo flag, size, identifiers and stock.
   - Keep raw responses for 90 days, the dispute window in `FEATURES.md`, and then delete them.
6. **Kill switch per source:** a `sources.enabled` flag that the bot checks before every task.

---

## 3. Sources

The rows marked *verify* come from secondary sources. Confirm them on each provider's developer portal in Phase P0.

| Retailer | Primary source | Price scope | Access needed | Notes |
| --- | --- | --- | --- | --- |
| **Kroger** (and banners) | Kroger Developer Products API | Per store (`filter.locationId`) | Free developer account (OAuth client credentials) | Community docs cite 10,000 Products calls/day and a separate Locations quota (*verify*). It is the best first source because it is official, local and free. |
| **Walmart** | Walmart.io Affiliate API (product lookup) | Online; store-level availability *verify* | Affiliate approval, consumer ID and private key | Returns price, was-price and seller. Restrict to items sold by Walmart, not marketplace sellers. |
| **Amazon** | Amazon Creators API | Online | Associates account; eligibility rules apply | PA-API 5 was retired in 2026 and replaced by the Creators API (OAuth 2.0). Whole Foods prices online may differ from in-store. |
| **Target** | Licensed feed (default); page collection only with sign-off | Per store or online | Vendor contract | No public price API is known. |
| **Costco** | Licensed feed (default) | Warehouse, member pricing | Vendor contract | Warehouse and online prices differ. Sizes are bulk, so compare unit prices. |
| **Albertsons / Safeway** | Licensed feed (default) | Per store | Vendor contract | Same position as Target. |
| *(benchmark)* **BLS Average Price Data** | `download.bls.gov/pub/time.series/ap/` | U.S. and 4 Census regions, monthly | None (public domain) | About 70 food items. Used for validation bands, history and the citable baseline in the app. It is not a retailer price. |

**Licensed-feed candidates to get quotes from:** grocery price data vendors (for example Datasembly, NielsenIQ or Circana), plus resellers of retailer feeds. Evaluate each on coverage of the six retailers, store-level granularity, history depth, refresh cadence, redistribution rights and price.

The redistribution right is critical. The app shows prices publicly and on share cards.

**Later regional chains:** Publix, H-E-B, Aldi, Ahold Delhaize banners and Meijer. They go through the same adapter interface once v1 is stable. The `Store` union in `src/data/types.ts` widens to match.

### Fallback: no API or licensed access

If API access is refused and licensed data is out of budget, these sources need nobody's permission:

1. **Kroger API.** Registration is self-serve, so this is the one retailer source most likely to stay available.
2. **BLS Average Price Data.** Public domain, but monthly and regional, not per store.
3. **Open Prices (Open Food Facts).** A crowd-sourced open price database under the ODbL license. Coverage in the U.S. is thin today. *verify*
4. **In-app receipts, opt-in.** The Log tab already parses receipts. Users can choose to contribute line items (item, price, store, ZIP-3, date), and nothing else.
   - The privacy answers in `PRIVACY.md` change: contributed prices leave the device.
   - Each price is checked against the matcher and validation rules before it counts.

**Public-page collection** is the last resort. It is built as a `page` source behind the same `PoliteHttp` client, and only within §2:

- **Pages:** public product pages with no login. Prices are read from the structured data the page publishes (JSON-LD `Offer`, or embedded product JSON), not from layout.
- **Store selection:** a store is chosen through the site's public store picker, the same way a logged-out shopper sets it.
- **Daily budget:** 150 items × ~10 stores per retailer is about 1,500 page loads per host per day. At 1 request every 5 seconds, that is about 2 hours per host in a nightly window.
- **Blocking:** if a site blocks the bot, that source stops.
  - Blocks show up as 403s, challenge pages or CAPTCHAs.
  - The bot does not rotate IPs, spoof browsers or solve challenges to get past a block.
- **Before enabling a site:**
  - Counsel reviews that site's terms.
  - Then `sources.legal_approved_at` is set.

---

## 4. The 150 items

Each item is a **canonical spec**, not a single product. The app compares like with like, so a spec pins:

- The descriptive name, category, target size and unit (`gal`, `oz`, `lb`, `ct`, `each`).
- A size tolerance, for example ±10%. Prices are always normalized to a unit price as well.
- **Brand policy:**
  - `national`: a pinned brand with GTINs, for example Heinz ketchup 32 oz.
  - `cheapest_comparable`: store brand allowed. This is used for commodities like milk, eggs and bananas.
- **Weight-priced produce and meat:** compared per pound or each, matching how the retailer sells it.
- An optional BLS series ID for cross-checks. About 55 of the 150 items map to one.

The 22 existing fixture items keep their IDs (`milk`, `eggs`, `ketchup`, …) so saved baskets and follows survive the switch.

### Seed list

The seed list is 150 items in 11 categories. Sizes are targets.

- **Dairy & eggs (18):**
  - Milk and eggs: whole milk 1 gal; 2% milk 1 gal; skim milk 1 gal; large eggs 12 ct; large eggs 18 ct.
  - Butter and cheese: salted butter 16 oz; unsalted butter 16 oz; cheddar block 8 oz; shredded mozzarella 8 oz; American singles 12 oz; cream cheese 8 oz; cottage cheese 16 oz.
  - Yogurt, cream and milk alternatives: Greek yogurt 32 oz; plain yogurt 32 oz; sour cream 16 oz; half-and-half 32 oz; heavy cream 16 oz; oat milk 64 oz.
- **Meat & seafood (16):**
  - Chicken and turkey: boneless chicken breast /lb; chicken thighs /lb; whole chicken /lb; ground turkey 16 oz.
  - Beef and pork: ground beef 80/20 /lb; ground beef 93/7 /lb; chuck roast /lb; sirloin steak /lb; pork chops /lb.
  - Bacon, sausage and deli: bacon 16 oz; breakfast sausage 16 oz; deli ham 16 oz; deli turkey 16 oz; hot dogs 16 oz.
  - Seafood: salmon fillet /lb; frozen shrimp 2 lb.
- **Produce (20):**
  - Fruit: bananas /lb; Gala apples 3 lb; navel oranges /lb; lemons each; strawberries 1 lb; grapes /lb; avocados each.
  - Root vegetables and alliums: russet potatoes 5 lb; sweet potatoes /lb; yellow onions 3 lb; carrots 2 lb; garlic 3 ct.
  - Salad and other vegetables: celery each; iceberg lettuce each; romaine hearts 3 ct; tomatoes /lb; green bell pepper each; broccoli crowns /lb; baby spinach 5 oz; cucumber each.
- **Bakery (10):**
  - Breads and buns: white bread 20 oz; wheat bread 20 oz; hamburger buns 8 ct; hot dog buns 8 ct; dinner rolls 12 ct.
  - Breakfast and tortillas: bagels 6 ct; English muffins 6 ct; flour tortillas 10 ct; corn tortillas 30 ct; bakery muffins 4 ct.
- **Pantry & dry goods (24):**
  - Grains and pasta: long-grain rice 5 lb; spaghetti 16 oz; penne 16 oz; mac & cheese 7.25 oz; dried black beans 1 lb.
  - Baking and oils: all-purpose flour 5 lb; sugar 4 lb; brown sugar 2 lb; salt 26 oz; vegetable oil 48 oz; olive oil 17 oz.
  - Breakfast: ground coffee 12 oz; tea bags 100 ct; toasted oat cereal 18 oz; oatmeal 42 oz; pancake mix 32 oz.
  - Spreads and condiments: peanut butter 16 oz; grape jelly 30 oz; honey 12 oz; Heinz ketchup 32 oz; Heinz ketchup 20 oz; yellow mustard 14 oz; mayonnaise 30 oz; pasta sauce 24 oz.
- **Canned (12):**
  - Protein and soup: tuna 5 oz; chicken noodle soup 10.75 oz; tomato soup 10.75 oz; chicken broth 32 oz.
  - Tomatoes: diced tomatoes 14.5 oz; tomato paste 6 oz.
  - Beans and vegetables: black beans 15 oz; kidney beans 15 oz; baked beans 28 oz; corn 15 oz; green beans 14.5 oz.
  - Fruit: peaches 15 oz.
- **Frozen (12):**
  - Vegetables and fruit: peas 12 oz; mixed vegetables 12 oz; broccoli florets 12 oz; berries 16 oz; french fries 32 oz.
  - Meals and protein: pepperoni pizza; chicken nuggets 2 lb; fish sticks 24 oz; burritos 8 ct; single-serve entrée.
  - Breakfast and dessert: waffles 10 ct; ice cream 48 oz.
- **Beverages (12):**
  - Juice: orange juice 52 oz; apple juice 64 oz; cranberry juice cocktail 64 oz; lemonade 52 oz.
  - Soft and energy drinks: cola 12-pack; cola 2 L; sports drink 8-pack; energy drink 4-pack.
  - Water, tea and coffee: bottled water 24-pack; sparkling water 8-pack; iced tea 1 gal; coffee pods 12 ct.
- **Snacks (8):** potato chips 8 oz; tortilla chips 13 oz; pretzels 16 oz; sandwich cookies 13 oz; saltines 16 oz; microwave popcorn 3 ct; granola bars 6 ct; salsa 16 oz.
- **Household (10):**
  - Paper and wraps: paper towels 6 roll; toilet paper 12 roll; trash bags 13 gal 40 ct; aluminum foil 75 sq ft; gallon zip bags.
  - Cleaning: dish soap 19 oz; laundry detergent 92 oz; dishwasher pods; all-purpose cleaner 32 oz; sponges 3 ct.
- **Personal care & baby (8):**
  - Personal care: toothpaste 4 oz; bar soap 6 ct; shampoo 12 oz; deodorant; body wash 18 oz.
  - Baby: diapers size 3; baby wipes.
  - Medicine: ibuprofen 200 mg 100 ct.

Phase P1 turns this list into `price-bot/catalog/items.csv`. It adds sizes, units, brand policy, GTINs and the BLS mapping, and it gets human review.

---

## 5. Architecture

### Topology

```
                ┌──────────── price-bot (Node 22 + TypeScript, container job) ────────────┐
 schedule ──▶   │ plan ─▶ fetch ─▶ extract ─▶ match ─▶ normalize ─▶ validate ─▶ load     │ ──▶ Supabase
 (cron)         │          │ per-host rate limiter, retries, raw-response cache (90 d)    │     (service role)
                └──────────┴──────────────────────────────────────────────────────────────┘
                               │                                        │
                        object storage                          review queue
                        (raw responses)                    (low-confidence matches)
```

**Why not Supabase Edge Functions:**
- A full run is thousands of rate-limited requests over hours, which is beyond Edge Function wall-clock limits.
- Licensed feeds arrive as bulk files.

**How it runs:**
- A container job on a scheduler. GitHub Actions cron is enough for P2–P4. Move to Fly Machines, Cloud Run Jobs or similar when runs exceed Actions limits.
- The ingest jobs that already exist (`ingest-eia`, `admin-metrics`) stay in Edge Functions.

**Why a Postgres queue instead of Temporal:**
- Tasks are short and idempotent, and their state already lives in Postgres.
- A `price_tasks` table claimed with `for update skip locked` gives retries, per-host concurrency and resumability with no new infrastructure.
- Revisit this if the bot grows past ~50k tasks per day.

### Pipeline stages

1. **Plan:**
   - Expand `items × enabled sources × sample stores` into `price_tasks` for this run.
   - Group tasks by host so the rate limiter can schedule fairly.
2. **Fetch:**
   - The source adapter makes the call: an API request, a bulk-file download, or an approved page fetch.
   - The rate limiter is a token bucket per host. It retries with jittered backoff on 429, 5xx and timeouts, at most 3 attempts.
   - The raw response is written to object storage and keyed by task.
3. **Extract:**
   - The adapter parses the response into `RawOffer` records: retailer SKU, GTIN/UPC, title, brand, size text, price, regular price, promo flag and text, member price, unit price if given, stock, store ID and timestamp.
   - Adapters are pure functions of the response, so they are tested on recorded responses.
4. **Match:** resolve each offer to a canonical item, in this order:
   1. Exact GTIN.
   2. A pinned retailer SKU from an approved crosswalk.
   3. The spec matcher: brand, size parsed to a base unit, category and title similarity.
   - The result carries a confidence score.
   - Scores ≥ 0.9 auto-approve.
   - Scores between 0.6 and 0.9 go to the review queue and are not published until approved.
   - Scores < 0.6 are discarded.
5. **Normalize:**
   - Parse the size into base units: oz, fl oz, lb, ct and each.
   - Compute the unit price.
   - Split prices into a **regular track** and a **promo track**, so temporary discounts don't corrupt the base-price ledger (`FEATURES.md`).
   - Record member and loyalty prices separately.
6. **Validate:**
   - Price > 0.
   - Unit price within the item's band. The band comes from BLS regional averages where mapped, and from trailing medians otherwise.
   - Week-over-week change > 40% on the regular track goes to review.
   - Size changed on the same SKU → a **size-change event**, which shows shrinkflation and is surfaced in the ledger.
   - Duplicates are collapsed.
7. **Load:** upsert into `price_observations` and record counts in `ingest_runs`. The admin dashboard reads `ingest_runs` already.
8. **Aggregate:** runs in SQL after each load. It refreshes the views and RPCs the app reads (§7), applying the change-detection hysteresis from `FEATURES.md`: moves under $0.03 or 0.5% are ignored.

### Store sampling

- For each retailer with local prices, pick about 2 stores in each PADD region where it operates. That is about 10 stores per retailer, chosen in metros with app users once telemetry has data.
- Online-only sources record `store_id = null` with scope `online`.
- **Budget:** 150 items × 10 stores = 1,500 Kroger product calls per run. That is well under the cited daily quota, so Kroger can run daily. Location lookups are a one-time setup cost.

### Adapter interface

```ts
interface SourceAdapter {
  id: SourceId;                       // 'kroger-api' | 'walmart-affiliate' | 'amazon-creators' | 'licensed-<vendor>' | 'bls-ap' | 'mock'
  retailer: Store | null;             // null for benchmarks (BLS)
  scope: 'store' | 'online' | 'region';
  hosts: string[];                    // for the rate limiter
  rateLimit: { perSecond: number; perDay?: number };
  plan(items: CanonicalItem[], stores: StoreRef[]): PriceTask[];
  fetch(task: PriceTask, http: PoliteHttp): Promise<RawResponse>;
  extract(raw: RawResponse): RawOffer[];
}
```

`PoliteHttp` is the only network path. It enforces robots.txt, the User-Agent, rate limits, the source kill switch and raw-response capture, so adapters cannot skip them.

---

## 6. Data model

This is a new migration next to the fuel tables. Market data is public-read under RLS, and writes require the service role. The `item_prices` sketch in `BUILD_PLAN.md` §9 is replaced by these tables.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `retailers` | The six chains, later more | `id`, `name`, `store` (matches the app's `Store` union) |
| `stores` | Sampled store locations | `id`, `retailer_id`, `external_id` (for example a Kroger `locationId`), `zip`, `state`, `padd`, `active` |
| `sources` | Adapters and their kill switch | `id`, `retailer_id`, `kind` (`api`, `licensed`, `structured`, `page`), `enabled`, `legal_approved_at`, `notes` |
| `items` | Canonical specs (§4) | `id`, `name`, `category`, `target_size`, `unit`, `size_tolerance`, `brand_policy`, `bls_series_id`, `in_default_basket` |
| `item_identifiers` | GTINs and SKUs per retailer | `item_id`, `retailer_id`, `gtin`, `retailer_sku`, `status` (`approved`, `pending`, `rejected`), `matched_by`, `confidence`, `reviewed_by`, `reviewed_at` |
| `price_observations` | One row per item × store/online × capture | `item_id`, `retailer_id`, `store_id`, `captured_at`, `week`, `regular_price`, `promo_price`, `member_price`, `size_qty`, `size_unit`, `unit_price`, `in_stock`, `source_id`, `run_id`, `raw_ref`, `match_confidence` |
| `price_events` | Detected changes: the ledger | `item_id`, `retailer_id`, `region`, `date`, `from`, `to`, `kind` (`increase`, `decrease`, `size_change`), `fuel_price_at`, `tag` |
| `price_tasks` | Work queue | `run_id`, `source_id`, `payload`, `state`, `attempts`, `claimed_at`, `error` |
| `review_queue` | Low-confidence matches and validation holds | `observation_ref`, `reason`, `state`, `decided_by`, `decided_at` |

**Views and RPCs for the app:**

- `item_price_weekly`: the median regular price per item × region × week, plus a national row.
- `basket_series_daily(item_ids, region, days)`: an equal-weight index, forward-filled to daily the same way as `fuel_series_daily`.
- `item_detail(item_id, region)`: weekly price, weekly fuel, change weeks and ledger.
- `item_verdicts`: the existing plan's nightly `compute-verdicts` job (lagged cross-correlation plus the asymmetry test from `FEATURES.md`), now fed with real series.
- `category_pass_through` and `retailer_scores`: materialized nightly.
- `item_provenance(item_id, zip)`: the latest source, capture time, method and confidence for the user's region.

---

## 7. App integration

These methods in `src/data/supabaseApi.ts` currently use fixtures and will call the new data instead:

| `DataApi` method | Backed by |
| --- | --- |
| `getCatalog`, `searchCatalog` | `items` plus the latest price per item (Postgres full-text search first; Typesense per `FEATURES.md` once the catalog grows) |
| `lookupBarcode` | `item_identifiers.gtin` (approved only) |
| `getBasketSeries` | `basket_series_daily` RPC |
| `getItem` | `item_detail` RPC plus `item_verdicts` |
| `getProvenance` | `item_provenance` RPC |
| `getCategoryPassThrough` | `category_pass_through` |
| `getRetailerScores` | `retailer_scores` |

`supabaseApi` stops spreading `fixtureApi`, which is the "done when" in `GO_LIVE.md`. `CatalogItem.store` becomes the retailer with the most recent observation in the user's region.

### The history gap

The app shows 12 months plus a 12-week lag lead-in. A new bot only collects prices from day one. Options, cheapest first:

1. **Launch with "tracking since <date>".** Verdicts unlock per item once it has ≥ 26 weeks of data. Until then, the item shows its price and the regional BLS trend. This needs a small UI state for "not enough history yet".
2. **Buy history.** Most licensed vendors sell backfill. It is worth asking for 18 months in the quote.
3. **BLS backfill at category level.** Use it for the category pass-through and the basket trend, clearly labelled as a national or regional average.

The recommended mix is 1 + 3, plus 2 if the vendor quote allows. Methodology copy then says which history each number uses.

---

## 8. Quality, monitoring and operations

- **Admin dashboard (Phase 8 page):** add a Price bot panel showing:
  - The last run per source, with status and duration.
  - Coverage: item × retailer cells filled this week.
  - Freshness: the oldest observation still in use.
  - Failure count by source.
  - The review queue size.
  - Validation holds.

  The panel extends `supabase/functions/_shared/metrics.ts` and the mock server's snapshot.
- **Alerts:**
  - A source fails 2 runs in a row.
  - Coverage drops by more than 10 points.
  - Review queue > 200.
  - A source starts returning 403 or blocks. The bot auto-disables the source and pages.
- **Weekly audit:** sample 50 published matches and check them by hand against the retailer listing. Track precision over time.
- **BLS cross-check:** each month, compare the bot's regional median for mapped items with BLS averages. Flag gaps > 25% for review. A gap is not always an error, because BLS is an all-outlet average.
- **Runbook:** how to pause a source, re-run a week, approve the review queue, handle a retailer's request to stop, and answer a price dispute from the raw snapshot.

---

## 9. Testing

- **Adapter golden tests:** recorded responses (sanitized) → expected `RawOffer[]`. A parser change that alters output fails CI.
- **Size and unit parser:** a table of ~300 real size strings ("2/12 oz", "12 ct (2 x 6)", "1.5 qt", "per lb") plus property tests: the unit price is invariant to how the size is expressed.
- **Matcher eval set:**
  - Built from about 500 labelled offers, including hard negatives such as 20 oz vs 32 oz ketchup and "organic" variants.
  - Gate: precision ≥ 98% and recall ≥ 85% at the auto-approve threshold.
- **Politeness tests:** `PoliteHttp` never exceeds a host's rate. It refuses paths disallowed by robots.txt and disabled sources, and it always sends the User-Agent.
- **Mock-first end to end:**
  - A mock Kroger-like API and a mock licensed-feed file are added to `mock-server/`.
  - `npm run bot -- --source mock --dry-run` runs the whole pipeline locally with no credentials.
  - A CI job then checks the views the app reads.
- **App contract:** the existing Playwright and Jest suites run against mock-server seeded by a bot run, so the app is proven against bot-shaped data before any live source exists.

---

## 10. Phases

Each phase ends with a commit, PR and merge, as before. Mock-first throughout: every phase runs end to end against mocks before any credentials exist.

### P0: Decisions and access (≈1 week, mostly owner-side)
- Register for the Kroger developer program, apply to Walmart.io Affiliate and Amazon Associates/Creators API, and request quotes from 2–3 licensed-data vendors.
- Legal review: each retailer's terms against the planned source; redistribution rights for licensed data; the "Gouge Gap" wording, which is already open in `BUILD_PLAN.md` §12.
- Confirm every *verify* row in §3 on the providers' current docs.
- **Exit:** a signed-off source list with an owner and access status per retailer.

### P1: Canonical catalog (≈3 days)
- `price-bot/catalog/items.csv`: the 150 specs with size, unit, tolerance, brand policy, GTINs for national brands, BLS mapping and default basket.
- A loader with schema validation; the existing 22 IDs are preserved.
- **Exit:** the catalog is reviewed and loads into `items` on the mock.

### P2: Schema and bot skeleton (≈4 days)
- The migration from §6, with RLS.
- The `price-bot/` package:
  - Config.
  - `PoliteHttp`, with its rate limiter, robots cache and kill switch.
  - The task queue.
  - Raw storage (local disk on the mock, object storage in production).
  - `ingest_runs` logging.
  - A mock adapter and a dry-run CLI.
- `mock-server` gains a Kroger-like product API.
- **Exit:** a mock run fills `price_observations` for all 150 items, and CI runs it.

### P3: Kroger adapter, matcher and normalizer (≈4 days)
- The first real adapter, behind `sources.enabled`.
- Location lookup for sampled stores.
- The size/unit parser, matcher and review queue.
- The matcher eval set and its CI gate.
- **Exit:** live Kroger data for 150 items × ~10 stores in a staging project, with precision ≥ 98% on audit.

### P4: Walmart and Amazon adapters (≈4 days)
- Both online sources, restricted to first-party sellers.
- Golden tests from recorded responses.
- **Exit:** three retailers live in staging.

### P5: Licensed feed(s) for Target, Costco and Albertsons (≈1 week, after a vendor is chosen)
- A bulk-file adapter that maps vendor IDs to `item_identifiers`, plus history backfill if purchased.
- Page collection is added here only for a source with written legal sign-off, and through `PoliteHttp` only.
- **Exit:** all six retailers ≥ 90% coverage in staging.

### P6: Validation, aggregates and monitoring (≈4 days)
- Validation rules, the size-change events, and hysteresis change detection into `price_events`.
- Views and RPCs, plus `compute-verdicts` on real data.
- The BLS adapter and monthly cross-check.
- The dashboard panel and alerts.
- **Exit:** the dashboard shows a full week. Alerts fire on injected failures.

### P7: App integration (≈1 week)
- Implement the §7 `DataApi` methods in `supabaseApi`, and remove the fixture spread.
- The "tracking since" state for items without enough history.
- Methodology copy updates.
- `PRIVACY.md` and `STORE_LISTING.md` re-checked.
- E2E and load tests re-run against bot-seeded data.
- **Exit:** the go-live blocker in `GO_LIVE.md` §1 is closed.

### P8: Burn-in and production (≈4 weeks calendar, little effort)
- Production schedule.
- Four weeks of daily runs with the weekly audit.
- Coverage and precision service levels met three weeks in a row.
- The runbook is written.
- **Exit:** the store screenshots in `STORE_LISTING.md` are captured from real data.

**Total build effort:** roughly 5–6 weeks, plus P0 approvals and P8 burn-in on the calendar.

---

## 11. Costs (order of magnitude)

| Item | Cost |
| --- | --- |
| Kroger API, BLS | Free |
| Walmart.io Affiliate, Amazon Creators API | Free, subject to program eligibility and approval |
| Licensed data (Target, Costco, Albertsons, and possibly history) | The main cost; needs quotes |
| Compute (container job, a few hours per day) | Low; tens of dollars a month |
| Object storage (90 days of raw responses) | Low; a few GB |
| Supabase | Existing project. `price_observations` grows by about 9k rows a day at full coverage, which is fine on a paid tier; partition by month after year one |

---

## 12. Risks and open questions

1. **Access approval.** Walmart and Amazon programs can reject or revoke apps that aren't driving affiliate sales, and Amazon's Creators API has eligibility thresholds. Mitigation: the licensed feed covers any retailer the APIs don't.
2. **Terms of service.** Covered by §2. The default for retailers without an API is a licensed feed, not scraping.
3. **Online vs in-store prices.** Online prices from Walmart and Amazon can differ from the shelf. The app labels scope in Provenance ("Online price, walmart.com"). Retailer scores compare like with like.
4. **Matching errors** produce false Gouge Gaps, which are the most damaging failure. Mitigations: the conservative auto-approve threshold, the review queue, the weekly audit, and a verdict that requires ≥ 26 weeks of data.
5. **The history gap.** See §7. This decides what the app can show at launch.
6. **Product churn.** Discontinued SKUs and reformulations. The matcher re-resolves weekly, and specs, not SKUs, are the unit of comparison.
7. **Open questions for the owner:**
   - What is the budget ceiling for licensed data?
   - Is it acceptable to launch with Kroger, Walmart and Amazon, adding the other three when a feed is signed?
   - Should the bot live in this repository (`price-bot/`, sharing types) or its own? This plan assumes this repository, to share `Store`, the domain math and the mock server.
