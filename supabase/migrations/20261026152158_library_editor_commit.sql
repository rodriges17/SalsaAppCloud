begin;
-- The editor submits membership and metadata in a single transaction. Existing
-- clients keep their library_save endpoint until they have loaded the new shell.
-- A prior verified direct schema deployment may exist. Validate its exact body
-- before replaying CREATE OR REPLACE through the normal migration mechanism.
do $migration_guard$
begin
 if to_regprocedure('cloud_private.cloud_api_before_library_editor(text,jsonb)') is null then
  alter function cloud_private.cloud_api(text,jsonb) rename to cloud_api_before_library_editor;
 elsif (select md5(prosrc) from pg_proc where oid='cloud_private.cloud_api(text,jsonb)'::regprocedure) <> 'b98b0a325c63847568266c9670229c0d' then
  raise exception 'Unexpected library API schema; refusing migration replay.';
 end if;
end $migration_guard$;
create or replace function cloud_private.cloud_api(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
declare lid uuid; version uuid; item jsonb; fid uuid; rid uuid; expected jsonb; result jsonb;
begin
 if action<>'library_commit' then return cloud_api_before_library_editor(action,payload); end if;
 if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
 perform pg_advisory_xact_lock(7193902);
 lid:=(payload->>'id')::uuid;
 if not cloud_can_manage_library(lid) then raise exception 'Keine Berechtigung.'; end if;
 select edit_version into version from cloud_libraries where id=lid for update;
 if version is distinct from nullif(payload->>'expected_version','')::uuid then
 raise exception 'Bibliothek wurde inzwischen geändert. Bitte neu laden, bevor du speicherst.' using errcode='PT409';
 end if;
 if jsonb_typeof(payload->'order') is distinct from 'array' or jsonb_typeof(coalesce(payload->'additions','[]')) is distinct from 'array' then raise exception 'Ungültige Figurenliste.'; end if;
 if (select count(distinct value) from jsonb_array_elements_text(payload->'order'))<>jsonb_array_length(payload->'order') then raise exception 'Figuren dürfen nur einmal vorkommen.'; end if;
 for item in select * from jsonb_array_elements(coalesce(payload->'additions','[]')) loop
  fid:=(item->>'figure')::uuid;rid:=(item->>'revision')::uuid;
  if not exists(select 1 from cloud_revisions where id=rid and figure_id=fid) or not payload->'order' @> jsonb_build_array(fid::text) then raise exception 'Ungültige Figurenzuordnung.'; end if;
  if payload->>'visibility'='public' and not exists(select 1 from cloud_figures where id=fid and public_allowed) then raise exception 'Der Figurenbesitzer muss die öffentliche Veröffentlichung erlauben.'; end if;
  if not exists(select 1 from cloud_entries where library_id=lid and figure_id=fid) then
   perform cloud_api_before_library_editor('attach',jsonb_build_object('library',lid,'revision',rid));
  end if;
 end loop;
 -- Validate all requested IDs before changing anything. Unknown IDs cannot be
 -- used to reference a figure without passing the existing attach checks.
 if exists(select 1 from jsonb_array_elements_text(payload->'order') x where not exists(select 1 from cloud_entries where library_id=lid and figure_id=x.value::uuid)) then raise exception 'Eine Figur ist nicht mehr verfügbar. Bitte neu laden.'; end if;
 delete from cloud_entries where library_id=lid and not payload->'order' @> jsonb_build_array(figure_id::text);
 select to_jsonb(edit_version) into expected from cloud_libraries where id=lid;
 -- Membership triggers advance the token inside this transaction; the original
 -- client token was checked above, before any writes.
 result:=cloud_api_before_library_editor('library_save',payload||jsonb_build_object('expected_version',expected));
 return result;
end $$;
revoke all on function cloud_private.cloud_api(text,jsonb) from public;
grant execute on function cloud_private.cloud_api(text,jsonb) to anon,authenticated,service_role;
revoke all on function cloud_private.cloud_api_before_library_editor(text,jsonb) from public,anon,authenticated;
commit;
