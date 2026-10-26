begin;
alter table public.cloud_libraries add column edit_version uuid not null default gen_random_uuid();
alter table public.cloud_entries add column position bigint;
-- Historical attachment times were not recorded. Use the earliest figure revision,
-- with the figure ID as a deterministic tie breaker, for the initial order.
with ranked as (
 select e.library_id,e.figure_id,row_number() over(partition by e.library_id order by
 (select min(created_at) from public.cloud_revisions r where r.figure_id=e.figure_id),e.figure_id) n
 from public.cloud_entries e
) update public.cloud_entries e set position=r.n from ranked r where e.library_id=r.library_id and e.figure_id=r.figure_id;
alter table public.cloud_entries alter column position set not null;
create index cloud_entries_order_idx on public.cloud_entries(library_id,position,figure_id);
create function cloud_private.cloud_library_version() returns trigger language plpgsql security invoker set search_path=public,cloud_private,pg_temp as $$
begin new.edit_version:=gen_random_uuid(); return new; end $$;
revoke all on function cloud_private.cloud_library_version() from public,anon,authenticated;
create trigger cloud_library_version before update on public.cloud_libraries for each row execute function cloud_private.cloud_library_version();
create function cloud_private.cloud_entry_order() returns trigger language plpgsql security invoker set search_path=public,cloud_private,pg_temp as $$
declare lid uuid;
begin
 lid:=case when TG_OP='DELETE' then old.library_id else new.library_id end;
 -- Same lock as publication: attachment, removal, review and order saves serialize.
 perform pg_advisory_xact_lock(7193902);
 if TG_OP='INSERT' then
 new.position:=coalesce((select max(position)+1 from cloud_entries where library_id=lid),1);
 end if;
 update cloud_libraries set edit_version=gen_random_uuid() where id=lid;
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function cloud_private.cloud_entry_order() from public,anon,authenticated;
create trigger cloud_entry_order before insert or update or delete on public.cloud_entries for each row execute function cloud_private.cloud_entry_order();
create function cloud_private.cloud_member_version() returns trigger language plpgsql security invoker set search_path=public,cloud_private,pg_temp as $$
begin
 update cloud_libraries set edit_version=gen_random_uuid() where id=case when TG_OP='DELETE' then old.library_id else new.library_id end;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
revoke all on function cloud_private.cloud_member_version() from public,anon,authenticated;
create trigger cloud_member_version after insert or update or delete on public.cloud_members for each row execute function cloud_private.cloud_member_version();
-- Keep the existing permission-filtered API as the source of visible entries.
alter function cloud_private.cloud_api(text,jsonb) rename to cloud_api_before_library_order;
create function cloud_private.cloud_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
declare result jsonb; lid uuid; version uuid; ordered jsonb;
begin
 if action not in ('state','library','poster_get','media','duplicates') then perform pg_advisory_xact_lock(7193902); end if;
 if action='library_save' and nullif(payload->>'id','') is not null and payload ? 'order' then
 lid:=(payload->>'id')::uuid;
 if auth.uid() is null or not cloud_can_manage_library(lid) then raise exception 'Keine Berechtigung.'; end if;
 select edit_version into version from cloud_libraries where id=lid for update;
 if version is distinct from nullif(payload->>'expected_version','')::uuid then
 raise exception 'Bibliothek wurde inzwischen geändert. Bitte neu laden, bevor du speicherst.' using errcode='PT409';
 end if;
 if jsonb_typeof(payload->'order') is distinct from 'array' then raise exception 'Ungültige Reihenfolge.'; end if;
 if jsonb_array_length(payload->'order')<>(select count(*) from cloud_entries where library_id=lid)
 or (select count(distinct value) from jsonb_array_elements_text(payload->'order'))<>jsonb_array_length(payload->'order')
 or exists(select 1 from jsonb_array_elements_text(payload->'order') x where not exists(select 1 from cloud_entries where library_id=lid and figure_id=x.value::uuid)) then
 raise exception 'Die Figuren der Bibliothek wurden geändert. Bitte neu laden.' using errcode='PT409';
 end if;
 -- Both metadata and positions commit together or neither commits.
 result:=cloud_api_before_library_order(action,payload);
 update cloud_entries e set position=x.n from jsonb_array_elements_text(payload->'order') with ordinality x(id,n)
 where e.library_id=lid and e.figure_id=x.id::uuid;
 return result;
 end if;
 result:=cloud_api_before_library_order(action,payload);
 if action='library' then
 lid:=(payload->>'id')::uuid;
 select coalesce(jsonb_agg(x.entry order by e.position,e.figure_id),'[]') into ordered
 from jsonb_array_elements(result->'entries') x(entry) join cloud_entries e on e.library_id=lid and e.figure_id=(x.entry->>'figure_id')::uuid;
 result:=jsonb_set(result,'{entries}',ordered);
 end if;
 return result;
end $$;
revoke all on function cloud_private.cloud_api(text,jsonb) from public,anon,authenticated;
revoke all on function cloud_private.cloud_api_before_library_order(text,jsonb) from public,anon,authenticated;
-- The public invoker wrapper delegates to this permission-checking entry point.
grant execute on function cloud_private.cloud_api(text,jsonb) to anon,authenticated,service_role;
commit;
