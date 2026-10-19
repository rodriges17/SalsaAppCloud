begin;
-- Serialize insertion against reservation release. A late upload must never become an orphan.
create or replace function cloud_private.cloud_can_upload_path(object_path text) returns boolean language plpgsql volatile security definer set search_path=public,cloud_private,pg_temp as $$
begin
 perform m.id from cloud_media m join cloud_jobs j on j.id=m.job_id join cloud_people p on p.id=m.owner_id where m.path=object_path and m.owner_id=auth.uid() and not m.ready and j.expires_at>now() and p.upload_enabled for update of m;
 return found;
end $$;
create function cloud_private.cloud_release_job(jid uuid) returns void language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
declare fid uuid;
begin
 select figure_id into fid from cloud_jobs where id=jid for update;
 perform id from cloud_media where job_id=jid for update;
 if exists(select 1 from cloud_media m join storage.objects o on o.name=m.path and o.bucket_id='salsa-cloud' where m.job_id=jid) then raise exception 'Upload ist noch aktiv. Bereinigung erneut versuchen.'; end if;
 delete from cloud_media where job_id=jid;
 delete from cloud_jobs where id=jid;
 delete from cloud_figures f where f.id=fid and not exists(select 1 from cloud_media where figure_id=f.id) and not exists(select 1 from cloud_revisions where figure_id=f.id) and not exists(select 1 from cloud_jobs where figure_id=f.id);
end $$;
revoke all on function cloud_private.cloud_release_job(uuid) from public,anon,authenticated;
grant execute on function cloud_private.cloud_release_job(uuid) to service_role;
create function cloud_private.cloud_delete_figure(fid uuid, uid uuid) returns void language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
begin
 perform id from cloud_figures where id=fid and (owner_id=uid or exists(select 1 from cloud_people where id=uid and is_admin)) for update;
 if not found then raise exception 'Keine Berechtigung.'; end if;
 perform id from cloud_media where figure_id=fid for update;
 if exists(select 1 from cloud_media m join storage.objects o on o.name=m.path and o.bucket_id='salsa-cloud' where m.figure_id=fid) then raise exception 'Dateilöschung noch nicht abgeschlossen. Erneut versuchen.'; end if;
 delete from cloud_entries where figure_id=fid;
 delete from cloud_revisions where figure_id=fid;
 delete from cloud_media where figure_id=fid;
 delete from cloud_jobs where figure_id=fid;
 delete from cloud_figures where id=fid;
end $$;
revoke all on function cloud_private.cloud_delete_figure(uuid,uuid) from public,anon,authenticated;
grant execute on function cloud_private.cloud_delete_figure(uuid,uuid) to service_role;
create function public.cloud_release_job(jid uuid) returns void language sql security invoker set search_path='' as $$ select cloud_private.cloud_release_job(jid) $$;
create function public.cloud_delete_figure(fid uuid,uid uuid) returns void language sql security invoker set search_path='' as $$ select cloud_private.cloud_delete_figure(fid,uid) $$;
revoke all on function public.cloud_release_job(uuid),public.cloud_delete_figure(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cloud_release_job(uuid),public.cloud_delete_figure(uuid,uuid) to service_role;
commit;
