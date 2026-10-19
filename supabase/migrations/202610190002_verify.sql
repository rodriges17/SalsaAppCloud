begin;
create function cloud_private.cloud_finish_media(media_id uuid, owner uuid) returns void language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
declare m cloud_media; actual bigint; kind text;
begin
 select * into m from cloud_media where id=media_id and owner_id=owner and job_id is not null for update;
 if m.id is null then raise exception 'Upload fehlt.'; end if;
 select (metadata->>'size')::bigint,metadata->>'mimetype' into actual,kind from storage.objects where bucket_id='salsa-cloud' and name=m.path;
 if actual is null or actual<1 or actual>m.bytes or kind<>m.mime then raise exception 'Dateigröße oder Dateiformat stimmt nicht.'; end if;
 update cloud_media set bytes=actual,ready=true where id=m.id;
end $$;
revoke all on function cloud_private.cloud_finish_media(uuid,uuid) from public,anon,authenticated;
grant execute on function cloud_private.cloud_finish_media(uuid,uuid) to service_role;
create function public.cloud_finish_media(media_id uuid, owner uuid) returns void language sql security invoker set search_path='' as $$ select cloud_private.cloud_finish_media(media_id,owner) $$;
revoke all on function public.cloud_finish_media(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cloud_finish_media(uuid,uuid) to service_role;
commit;
