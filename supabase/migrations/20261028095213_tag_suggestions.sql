begin;
-- A read-only extension of the existing API. Keep all authorization in the
-- existing revision predicate, including public consent and pending revisions.
alter function cloud_private.cloud_api(text,jsonb) rename to cloud_api_before_tags;
create function cloud_private.cloud_api(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if action<>'tags' then return cloud_private.cloud_api_before_tags(action,payload); end if;
 -- Anonymous callers deliberately receive only tags of public, readable content.
 return jsonb_build_object('complete',true,'tags',coalesce((
  select jsonb_agg(tag order by tag) from (
   select distinct tag collate "C" as tag
   from public.cloud_revisions r
   cross join lateral jsonb_array_elements_text(r.tags) as t(tag)
   where cloud_private.cloud_can_read_revision(r.id) and tag<>''
  ) accessible_tags
 ),'[]'::jsonb));
end $$;
revoke all on function cloud_private.cloud_api(text,jsonb) from public;
grant execute on function cloud_private.cloud_api(text,jsonb) to anon,authenticated,service_role;
revoke all on function cloud_private.cloud_api_before_tags(text,jsonb) from public,anon,authenticated;
commit;
