-- Grocery price data collected by the price bot (price-bot/, PRICE_BOT_PLAN.md §6).
-- Market data is public read-only. The bot writes with the service role, which bypasses RLS.

create table public.retailers (
  id text primary key check (id ~ '^[a-z]+$'),
  -- Matches the app's Store union (src/data/types.ts).
  name text not null unique
);

insert into public.retailers (id, name) values
  ('kroger', 'Kroger'),
  ('walmart', 'Walmart'),
  ('amazon', 'Amazon'),
  ('target', 'Target'),
  ('costco', 'Costco'),
  ('albertsons', 'Albertsons');

-- Sampled store locations (about 2 per PADD region per retailer).
create table public.stores (
  id bigint generated always as identity primary key,
  retailer_id text not null references public.retailers (id),
  -- The retailer's own location ID, e.g. a Kroger locationId.
  external_id text not null,
  name text not null,
  zip text not null check (zip ~ '^\d{5}$'),
  state text not null check (state ~ '^[A-Z]{2}$'),
  padd text not null check (padd in ('east', 'mid', 'gulf', 'rocky', 'west')),
  active boolean not null default true,
  unique (retailer_id, external_id)
);

-- One row per adapter. `enabled` is the kill switch the bot checks before every task.
create table public.sources (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  retailer_id text references public.retailers (id),
  kind text not null check (kind in ('api', 'licensed', 'structured', 'page', 'mock')),
  scope text not null check (scope in ('store', 'online', 'region')),
  enabled boolean not null default false,
  -- Page collection may only be enabled after counsel signs off on that site (§2).
  legal_approved_at timestamptz,
  notes text,
  check (not (kind = 'page' and enabled and legal_approved_at is null))
);

insert into public.sources (id, retailer_id, kind, scope, notes) values
  ('kroger-api', 'kroger', 'api', 'store', 'Kroger Developer Products API'),
  ('walmart-affiliate', 'walmart', 'api', 'online', 'Walmart.io Affiliate API'),
  ('walmart-page', 'walmart', 'page', 'store', 'Public walmart.com product pages; needs legal sign-off'),
  ('amazon-creators', 'amazon', 'api', 'online', 'Amazon Creators API'),
  ('amazon-page', 'amazon', 'page', 'online', 'Public amazon.com product pages; needs legal sign-off'),
  ('bls-ap', null, 'structured', 'region', 'BLS Average Price Data (benchmark)');

-- The canonical catalog, synced from price-bot/catalog/items.csv by the bot.
create table public.items (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  category text not null,
  size_qty numeric(10, 3) not null check (size_qty > 0),
  size_unit text not null
    check (size_unit in ('oz', 'lb', 'fl_oz', 'gal', 'qt', 'l', 'ml', 'ct', 'roll', 'each', 'sq_ft')),
  priced_by text not null check (priced_by in ('package', 'lb', 'each')),
  size_tolerance numeric(4, 3) not null check (size_tolerance between 0 and 0.25),
  brand_policy text not null check (brand_policy in ('national', 'cheapest_comparable')),
  brand text,
  ref_price numeric(8, 2) not null check (ref_price > 0),
  bls_series_id text,
  in_default_basket boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (brand_policy <> 'national' or brand is not null)
);

-- Retailer products matched to catalog items. Only approved rows are used or shown.
create table public.item_identifiers (
  id bigint generated always as identity primary key,
  item_id text not null references public.items (id),
  retailer_id text not null references public.retailers (id),
  retailer_sku text not null,
  gtin text check (gtin ~ '^\d{8,14}$'),
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  matched_by text not null check (matched_by in ('gtin', 'crosswalk', 'spec', 'manual')),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (retailer_id, retailer_sku)
);

create index item_identifiers_gtin_idx on public.item_identifiers (gtin) where gtin is not null;

-- One row per item × retailer × store (or online) × day × source. Re-running a day upserts.
create table public.price_observations (
  id bigint generated always as identity primary key,
  item_id text not null references public.items (id),
  retailer_id text not null references public.retailers (id),
  -- Null for online prices.
  store_id bigint references public.stores (id),
  source_id text not null references public.sources (id),
  run_id bigint references public.ingest_runs (id),
  day date not null,
  captured_at timestamptz not null,
  regular_price numeric(8, 2) not null check (regular_price > 0),
  promo_price numeric(8, 2) check (promo_price > 0 and promo_price < regular_price),
  member_price numeric(8, 2) check (member_price > 0),
  size_qty numeric(10, 3) not null check (size_qty > 0),
  size_unit text not null,
  -- Regular price per base unit (g, ml, count, each or sq ft), for comparing pack sizes.
  unit_price numeric(12, 6) not null check (unit_price > 0),
  in_stock boolean,
  retailer_sku text not null,
  match_confidence numeric(4, 3) not null check (match_confidence between 0 and 1),
  -- Key of the raw response in object storage, kept 90 days for disputes.
  raw_ref text,
  unique nulls not distinct (item_id, retailer_id, store_id, day, source_id)
);

create index price_observations_item_day_idx on public.price_observations (item_id, day desc);
create index price_observations_day_idx on public.price_observations (day desc);

-- Detected price changes: the ledger (filled by change detection in P6).
create table public.price_events (
  id bigint generated always as identity primary key,
  item_id text not null references public.items (id),
  retailer_id text not null references public.retailers (id),
  region text not null check (region in ('east', 'mid', 'gulf', 'rocky', 'west', 'nat')),
  day date not null,
  from_price numeric(8, 2) not null,
  to_price numeric(8, 2) not null,
  kind text not null check (kind in ('increase', 'decrease', 'size_change')),
  fuel_price_at numeric(6, 3),
  tag text,
  unique (item_id, retailer_id, region, day, kind)
);

-- Work queue for one bot run. Workers claim tasks with claim_price_tasks().
create table public.price_tasks (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.ingest_runs (id),
  source_id text not null references public.sources (id),
  host text not null,
  payload jsonb not null,
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  not_before timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  error text
);

create index price_tasks_claim_idx on public.price_tasks (run_id, state, not_before);

-- Observations held back from publishing until a person decides.
create table public.review_queue (
  id bigint generated always as identity primary key,
  item_id text references public.items (id),
  retailer_id text not null references public.retailers (id),
  store_id bigint references public.stores (id),
  source_id text references public.sources (id),
  run_id bigint references public.ingest_runs (id),
  day date not null,
  reason text not null
    check (reason in ('low_confidence', 'price_jump', 'out_of_band', 'size_change', 'contribution')),
  detail jsonb not null default '{}'::jsonb,
  state text not null default 'open' check (state in ('open', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);

create index review_queue_open_idx on public.review_queue (state, created_at) where state = 'open';

-- Opt-in prices from users' receipts (§3.1). Written only by the contribute-prices function.
-- Holds no install ID, full ZIP, receipt text or photo.
create table public.contributed_prices (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.items (id),
  retailer_id text not null references public.retailers (id),
  zip3 text not null check (zip3 ~ '^\d{3}$'),
  purchased_on date not null,
  price numeric(8, 2) not null check (price > 0),
  is_sale boolean not null default false,
  size_qty numeric(10, 3),
  size_unit text,
  received_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending', 'published', 'held', 'rejected')),
  check (purchased_on <= (received_at at time zone 'UTC')::date + 1)
);

-- Claims up to p_limit queued tasks for a run, skipping rows another worker holds.
create function public.claim_price_tasks(p_run_id bigint, p_limit integer)
returns setof public.price_tasks
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.price_tasks t
  set state = 'running', claimed_at = now(), attempts = t.attempts + 1
  where t.id in (
    select id from public.price_tasks
    where run_id = p_run_id and state = 'queued' and not_before <= now()
    order by id
    limit p_limit
    for update skip locked
  )
  returning t.*;
$$;

comment on function public.claim_price_tasks is
  'Marks up to p_limit queued tasks of a run as running and returns them. Service role only.';

alter table public.retailers enable row level security;
alter table public.stores enable row level security;
alter table public.sources enable row level security;
alter table public.items enable row level security;
alter table public.item_identifiers enable row level security;
alter table public.price_observations enable row level security;
alter table public.price_events enable row level security;
alter table public.price_tasks enable row level security;
alter table public.review_queue enable row level security;
alter table public.contributed_prices enable row level security;

create policy "Retailers are public" on public.retailers
  for select to anon, authenticated using (true);
create policy "Stores are public" on public.stores
  for select to anon, authenticated using (true);
create policy "Items are public" on public.items
  for select to anon, authenticated using (true);
create policy "Approved identifiers are public" on public.item_identifiers
  for select to anon, authenticated using (status = 'approved');
create policy "Prices are public" on public.price_observations
  for select to anon, authenticated using (true);
create policy "Price events are public" on public.price_events
  for select to anon, authenticated using (true);

-- No policies on sources, price_tasks, review_queue or contributed_prices: clients cannot read
-- or write them.
revoke all on public.sources, public.price_tasks, public.review_queue, public.contributed_prices
  from anon, authenticated;
grant select on public.retailers, public.stores, public.items, public.item_identifiers,
  public.price_observations, public.price_events to anon, authenticated;
revoke execute on function public.claim_price_tasks(bigint, integer) from public, anon, authenticated;
grant execute on function public.claim_price_tasks(bigint, integer) to service_role;
