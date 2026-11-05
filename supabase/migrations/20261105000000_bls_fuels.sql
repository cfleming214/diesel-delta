-- BLS fuel benchmarks: gasoline grades, diesel, fuel oil, electricity and piped gas. Their item
-- codes have five characters (74714, 7471A) where food codes have six, and electricity and gas
-- are priced per kWh and per therm.
alter table public.bls_series
  drop constraint bls_series_id_check,
  add constraint bls_series_id_check check (id ~ '^APU[0-9A-Z]{4}[0-9A-Z]{5,6}$'),
  drop constraint bls_series_unit_check,
  add constraint bls_series_unit_check
    check (unit in ('oz', 'lb', 'fl_oz', 'gal', 'l', 'ct', 'kwh', 'therm'));
