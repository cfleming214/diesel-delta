-- Assertions for app_events. Run by scripts/check-migrations.sh.
\set ON_ERROR_STOP on

set role anon;
insert into public.app_events (occurred_at, install_id, session_id, name, props, platform, app_version)
values (now(), gen_random_uuid(), gen_random_uuid(), 'app_open', '{"cold": true}', 'ios', '1.0.0');

do $$
begin
  begin
    perform count(*) from public.app_events;
    raise exception 'anon should not read app_events';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.app_events (occurred_at, install_id, session_id, name, platform, app_version)
    values (now(), gen_random_uuid(), gen_random_uuid(), 'read_contacts', 'ios', '1.0.0');
    raise exception 'unknown event names should fail';
  exception when check_violation then null;
  end;
  begin
    insert into public.app_events (occurred_at, install_id, session_id, name, props, platform, app_version)
    values (now(), gen_random_uuid(), gen_random_uuid(), 'search',
            jsonb_build_object('q', repeat('x', 2000)), 'ios', '1.0.0');
    raise exception 'oversized props should fail';
  exception when check_violation then null;
  end;
  begin
    insert into public.app_events (occurred_at, install_id, session_id, name, platform, app_version)
    values (now() - interval '3 days', gen_random_uuid(), gen_random_uuid(), 'app_open', 'ios', '1.0.0');
    raise exception 'stale timestamps should fail';
  exception when check_violation then null;
  end;
  begin
    insert into public.app_events (received_at, occurred_at, install_id, session_id, name, platform, app_version)
    values (now() - interval '1 year', now(), gen_random_uuid(), gen_random_uuid(), 'app_open', 'ios', '1.0.0');
    raise exception 'clients should not set received_at';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare n integer;
begin
  select count(*) into n from public.app_events;
  assert n = 1, format('expected 1 event, got %s', n);
end $$;

select 'events assertions passed' as result;
