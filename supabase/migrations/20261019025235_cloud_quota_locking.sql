begin;
-- Read mutable quota/approval state only after the same lock used by administrators.
-- Otherwise an uploader that waited for a quota change could retain the old values.
create or replace function public.cloud_api(action text, payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if action in ('reserve','commit','admin_person','admin_limit') then
   perform pg_catalog.pg_advisory_xact_lock(7193902);
 end if;
 return cloud_private.cloud_api(action,payload);
end $$;
revoke all on function public.cloud_api(text,jsonb) from public;
grant execute on function public.cloud_api(text,jsonb) to anon,authenticated,service_role;
commit;
