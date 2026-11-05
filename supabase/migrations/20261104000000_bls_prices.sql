-- BLS Average Price Data (PRICE_BOT_PLAN.md §3, §7, §8): monthly all-outlet average prices for
-- the U.S. and the four Census regions, loaded by `npm run bot -- bls`. A benchmark, not a
-- retailer price: it backs history before the bot's own collection, validation bands and the
-- monthly cross-check. Public domain, so it is public read like other market data.

-- One BLS series (an item code in one area), with its unit as stated by BLS.
create table public.bls_series (
  id text primary key check (id ~ '^APU[0-9A-Z]{4}[0-9A-Z]{6}$'),
  item_code text not null,
  area_code text not null check (area_code in ('0000', '0100', '0200', '0300', '0400')),
  region text not null check (region in ('nat', 'northeast', 'midwest', 'south', 'west')),
  item_name text not null,
  -- What one quoted price buys, e.g. 1 lb, 0.5 gal or 12 ct. Null when BLS's wording isn't parsed.
  unit_qty numeric(10, 3) check (unit_qty > 0),
  unit text check (unit in ('oz', 'lb', 'fl_oz', 'gal', 'l', 'ct')),
  -- First and last months BLS has published. Many regional series stopped after October 2025.
  begin_month date not null,
  end_month date not null,
  updated_at timestamptz not null default now(),
  unique (item_code, area_code)
);

-- One monthly average price. `month` is the first day of the month.
create table public.bls_prices (
  series_id text not null references public.bls_series (id),
  month date not null check (extract(day from month) = 1),
  price numeric(8, 3) not null check (price > 0),
  run_id bigint references public.ingest_runs (id),
  primary key (series_id, month)
);

create index bls_prices_month_idx on public.bls_prices (month desc);

alter table public.bls_series enable row level security;
alter table public.bls_prices enable row level security;

create policy "BLS series are public" on public.bls_series
  for select to anon, authenticated using (true);
create policy "BLS prices are public" on public.bls_prices
  for select to anon, authenticated using (true);

grant select on public.bls_series, public.bls_prices to anon, authenticated;

-- Public-domain bulk files with no terms to clear, so the source starts enabled. The kill switch
-- still applies: set enabled = false to stop it.
update public.sources set enabled = true where id = 'bls-ap';
