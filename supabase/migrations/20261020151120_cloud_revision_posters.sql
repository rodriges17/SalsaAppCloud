begin;
-- Revision-scoped JPEGs live in the private schema, never in public state responses.
create table cloud_private.revision_posters (
 revision_id uuid primary key references public.cloud_revisions(id) on delete cascade,
 owner_id uuid not null references public.cloud_people(id),
 image bytea not null,
 bytes integer generated always as (octet_length(image)) stored,
 kind text not null check (kind in ('local','frame')),
 check (octet_length(image) between 5 and 65536)
);
alter table cloud_private.revision_posters enable row level security;
revoke all on cloud_private.revision_posters from public,anon,authenticated;
create index revision_posters_owner_id_idx on cloud_private.revision_posters(owner_id);
create function cloud_private.cloud_used_bytes(uid uuid default null) returns bigint language sql stable security invoker set search_path=public,cloud_private,pg_temp as $$
 select coalesce((select sum(bytes) from cloud_media where uid is null or owner_id=uid),0)
      + coalesce((select sum(bytes) from revision_posters where uid is null or owner_id=uid),0)
$$;
revoke all on function cloud_private.cloud_used_bytes(uuid) from public,anon,authenticated;
create function cloud_private.cloud_save_poster(rid uuid, encoded text, source_kind text) returns jsonb language plpgsql security invoker set search_path=public,cloud_private,pg_temp as $$
declare owner uuid; image_bytes bytea; previous revision_posters; cfg cloud_settings; quota_bytes bigint;
begin
 select f.owner_id into owner from cloud_revisions r join cloud_figures f on f.id=r.figure_id where r.id=rid;
 if auth.uid() is null or owner is null or not (cloud_is_admin() or (owner=auth.uid() and exists(select 1 from cloud_people where id=auth.uid() and upload_enabled))) then raise exception 'Nur Besitzer oder Administratoren dürfen Vorschaubilder ergänzen.'; end if;
 if encoded is null or length(encoded)>90000 or encoded !~ '^[A-Za-z0-9+/]+={0,2}$' or source_kind not in ('local','frame') then raise exception 'Ungültiges Vorschaubild.'; end if;
 image_bytes:=decode(encoded,'base64');
 if octet_length(image_bytes) not between 5 and 65536 or substring(image_bytes from 1 for 3)<>decode('ffd8ff','hex') or substring(image_bytes from octet_length(image_bytes)-1 for 2)<>decode('ffd9','hex') then raise exception 'JPEG-Vorschaubild überschreitet das Limit oder ist ungültig.'; end if;
 -- Same lock as video reservations and quota updates: one canonical poster per revision.
 perform pg_advisory_xact_lock(7193902);
 select * into previous from revision_posters where revision_id=rid;
 if previous.revision_id is not null and (previous.kind='local' or source_kind='frame') then
   return jsonb_build_object('poster',replace(encode(previous.image,'base64'),E'\n',''),'kind',previous.kind);
 end if;
 select * into cfg from cloud_settings;
 select quota into quota_bytes from cloud_people where id=owner;
 if cloud_used_bytes()+octet_length(image_bytes)-coalesce(previous.bytes,0)>cfg.total_limit or cloud_used_bytes(owner)+octet_length(image_bytes)-coalesce(previous.bytes,0)>quota_bytes then raise exception 'Nicht genug freier Speicher für das Vorschaubild.'; end if;
 insert into revision_posters(revision_id,owner_id,image,kind) values(rid,owner,image_bytes,source_kind)
 on conflict(revision_id) do update set image=excluded.image,kind=excluded.kind;
 return jsonb_build_object('poster',replace(encode(image_bytes,'base64'),E'\n',''),'kind',source_kind);
end $$;
revoke all on function cloud_private.cloud_save_poster(uuid,text,text) from public,anon,authenticated;
create or replace function cloud_private.cloud_api(action text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
declare
 me uuid:=auth.uid(); admin boolean:=cloud_is_admin(); who cloud_people; lib cloud_libraries; fig cloud_figures; rev cloud_revisions; job cloud_jobs; med cloud_media; cfg cloud_settings;
 lid uuid; fid uuid; rid uuid; uid uuid; jid uuid; mid uuid; item jsonb; result jsonb; ids jsonb:='[]'; videos jsonb:='[]'; n int; count_ids int; used bigint; reserved bigint;
begin
 select * into who from cloud_people where id=me;
 if action='state' then
   return jsonb_build_object('me',case when who.id is null then null else to_jsonb(who)||jsonb_build_object('used',cloud_used_bytes(me)) end,
   'settings',case when admin then (select to_jsonb(s)||jsonb_build_object('used',cloud_used_bytes()) from cloud_settings s) else null end,
   'people',case when admin then coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('used',cloud_used_bytes(p.id))) from cloud_people p),'[]') else '[]'::jsonb end,
   'libraries',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('manage',cloud_can_manage_library(l.id),'contribute',cloud_can_contribute(l.id))) from cloud_libraries l where cloud_can_read_library(l.id)),'[]'),
   'own_figures',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('revisions',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from cloud_revisions r where r.figure_id=f.id),'[]'))) from cloud_figures f where f.owner_id=me),'[]'));
 elsif action='library' then
   lid:=(payload->>'id')::uuid;
   if not cloud_can_read_library(lid) then raise exception 'Kein Zugriff auf diese Bibliothek.'; end if;
   select * into lib from cloud_libraries where id=lid;
   return jsonb_build_object('library',to_jsonb(lib),'manage',cloud_can_manage_library(lid),'contribute',cloud_can_contribute(lid),
   'members',case when cloud_can_manage_library(lid) then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'upload_enabled',p.upload_enabled,'role',m.role)) from cloud_members m join cloud_people p on p.id=m.user_id where m.library_id=lid),'[]') else '[]'::jsonb end,
   'entries',coalesce((select jsonb_agg(jsonb_build_object('figure_id',e.figure_id,'owner_id',f.owner_id,'public_allowed',f.public_allowed,'published',case when cloud_can_read_revision(e.published_id) then (select to_jsonb(r) from cloud_revisions r where r.id=e.published_id) else null end,'pending',case when cloud_can_read_revision(e.pending_id) then (select to_jsonb(r) from cloud_revisions r where r.id=e.pending_id) else null end)) from cloud_entries e join cloud_figures f on f.id=e.figure_id where e.library_id=lid and (cloud_can_manage_library(lid) or f.owner_id=me or (e.published_id is not null and (lib.visibility='private' or f.public_allowed)))),'[]'));
 elsif action='poster_get' then
   rid:=(payload->>'revision')::uuid;
   if not cloud_can_read_revision(rid) then raise exception 'Kein Zugriff auf dieses Vorschaubild.'; end if;
   select * into rev from cloud_revisions where id=rid;
   select * into fig from cloud_figures where id=rev.figure_id;
   return jsonb_build_object('poster',(select replace(encode(image,'base64'),E'\n','') from revision_posters where revision_id=rid),
     'kind',(select kind from revision_posters where revision_id=rid),
     'can_write',coalesce(admin or (fig.owner_id=me and who.upload_enabled),false));
 elsif action='poster_put' then
   return cloud_save_poster((payload->>'revision')::uuid,payload->>'data',coalesce(payload->>'kind','local'));
 elsif action='media' then
   rid:=(payload->>'revision')::uuid; mid:=(payload->>'media')::uuid;
   if not cloud_can_read_revision(rid) then raise exception 'Kein Zugriff auf dieses Video.'; end if;
   if not exists(select 1 from cloud_revisions r,jsonb_array_elements(r.videos) v where r.id=rid and (v->>'id')::uuid=mid) then raise exception 'Video gehört nicht zur Version.'; end if;
   select * into med from cloud_media where id=mid and ready;
   if med.id is null then raise exception 'Video fehlt.'; end if;
   return to_jsonb(med);
 end if;
 if me is null or who.id is null then raise exception 'Bitte mit einem freigeschalteten Konto anmelden.'; end if;
 if action='admin_person' then
   if not admin then raise exception 'Nur der Plattform-Administrator darf Personen freischalten.'; end if;
   perform pg_advisory_xact_lock(7193902);
   uid:=(payload->>'id')::uuid;
   if not exists(select 1 from auth.users where id=uid) then raise exception 'Konto fehlt.'; end if;
   if uid=me and not (payload->>'enabled')::boolean then raise exception 'Eigenen Zugang nicht sperren.'; end if;
   if (payload->>'quota')::bigint<cloud_used_bytes(uid) then raise exception 'Limit kleiner als belegter Speicher.'; end if;
   insert into cloud_people(id,email,upload_enabled,quota) select id,email,(payload->>'enabled')::boolean,(payload->>'quota')::bigint from auth.users where id=uid on conflict(id) do update set upload_enabled=excluded.upload_enabled,quota=excluded.quota;
 elsif action='admin_limit' then
   if not admin then raise exception 'Keine Berechtigung.'; end if;
   perform pg_advisory_xact_lock(7193902);
   if (payload->>'bytes')::bigint<cloud_used_bytes() then raise exception 'Limit kleiner als belegter Speicher.'; end if;
   update cloud_settings set total_limit=(payload->>'bytes')::bigint where id=true;
 elsif action='library_save' then
   lid:=nullif(payload->>'id','')::uuid;
   if lid is null then
     if not who.upload_enabled then raise exception 'Keine Freischaltung zum Erstellen von Bibliotheken.'; end if;
     insert into cloud_libraries(owner_id,title,description,visibility,collaborative,moderated) values(me,payload->>'title',coalesce(payload->>'description',''),payload->>'visibility',(payload->>'collaborative')::boolean,(payload->>'moderated')::boolean) returning id into lid;
   else
     if not cloud_can_manage_library(lid) then raise exception 'Keine Berechtigung.'; end if;
     update cloud_libraries set title=payload->>'title',description=coalesce(payload->>'description',''),visibility=payload->>'visibility',collaborative=(payload->>'collaborative')::boolean,moderated=(payload->>'moderated')::boolean where id=lid;
   end if;
   return jsonb_build_object('id',lid);
 elsif action='library_delete' then
   lid:=(payload->>'id')::uuid;
   if not cloud_can_manage_library(lid) then raise exception 'Keine Berechtigung.'; end if;
   delete from cloud_libraries where id=lid;
 elsif action='member' then
   lid:=(payload->>'library')::uuid;
   if not cloud_can_manage_library(lid) then raise exception 'Keine Berechtigung.'; end if;
   select id into uid from cloud_people where lower(email)=lower(trim(payload->>'email'));
   if uid is null then raise exception 'Person muss zuerst vom Administrator angelegt werden.'; end if;
   if payload->>'role'='remove' then delete from cloud_members where library_id=lid and user_id=uid;
   else
     if payload->>'role'='contributor' and not exists(select 1 from cloud_people where id=uid and upload_enabled) then raise exception 'Person hat keine Upload-Freigabe.'; end if;
     insert into cloud_members values(lid,uid,payload->>'role') on conflict(library_id,user_id) do update set role=excluded.role;
   end if;
 elsif action='public_permission' then
   fid:=(payload->>'figure')::uuid;
   if not exists(select 1 from cloud_figures where id=fid and owner_id=me) then raise exception 'Nur der Figurenbesitzer darf die öffentliche Veröffentlichung erlauben.'; end if;
   update cloud_figures set public_allowed=(payload->>'allowed')::boolean where id=fid;
 elsif action='attach' then
   lid:=(payload->>'library')::uuid; rid:=(payload->>'revision')::uuid;
   if not cloud_can_contribute(lid) then raise exception 'Keine Beitragsberechtigung.'; end if;
   if not cloud_can_read_revision(rid) then raise exception 'Kein Zugriff auf die Figur.'; end if;
   select * into rev from cloud_revisions where id=rid;
   select * into fig from cloud_figures where id=rev.figure_id;
   select * into lib from cloud_libraries where id=lid;
   if lib.visibility='public' and not fig.public_allowed then raise exception 'Der Figurenbesitzer muss die öffentliche Veröffentlichung erlauben.'; end if;
   insert into cloud_entries(library_id,figure_id,published_id,pending_id) values(lid,fig.id,case when not lib.moderated or cloud_can_manage_library(lid) then rid end,case when lib.moderated and not cloud_can_manage_library(lid) then rid end)
   on conflict(library_id,figure_id) do update set published_id=case when not lib.moderated or cloud_can_manage_library(lid) then rid else cloud_entries.published_id end,pending_id=case when lib.moderated and not cloud_can_manage_library(lid) then rid else null end;
 elsif action='review' then
   lid:=(payload->>'library')::uuid; fid:=(payload->>'figure')::uuid;
   if not cloud_can_manage_library(lid) then raise exception 'Keine Freigabeberechtigung.'; end if;
   if (payload->>'accept')::boolean then
     select * into lib from cloud_libraries where id=lid;
     if lib.visibility='public' and not exists(select 1 from cloud_figures where id=fid and public_allowed) then raise exception 'Öffentliche Zustimmung des Figurenbesitzers fehlt.'; end if;
     update cloud_entries set published_id=pending_id,pending_id=null where library_id=lid and figure_id=fid and pending_id is not null;
   else update cloud_entries set pending_id=null where library_id=lid and figure_id=fid; end if;
 elsif action='detach' then
   lid:=(payload->>'library')::uuid; fid:=(payload->>'figure')::uuid;
   if not cloud_can_manage_library(lid) and not exists(select 1 from cloud_figures where id=fid and owner_id=me) then raise exception 'Keine Berechtigung.'; end if;
   delete from cloud_entries where library_id=lid and figure_id=fid;
 elsif action='reserve' then
   if not who.upload_enabled then raise exception 'Uploads sind nicht freigeschaltet.'; end if;
   if jsonb_typeof(payload->'videos') is distinct from 'array' then raise exception 'Videoliste fehlt.'; end if;
   n:=jsonb_array_length(payload->'videos');
   if n not between 1 and 100 then raise exception 'Bitte 1 bis 100 Videos auswählen.'; end if;
   perform pg_advisory_xact_lock(7193902);
   select * into cfg from cloud_settings;
   reserved:=n*cfg.file_limit;
   if reserved+cloud_used_bytes()>cfg.total_limit or reserved+cloud_used_bytes(me)>who.quota then raise exception 'Nicht genug freier Speicher für den Upload. Laufende Uploads zählen mit.'; end if;
   for item in select * from jsonb_array_elements(payload->'videos') loop
     if (item->>'size')::bigint not between 1 and cfg.file_limit then raise exception 'Ein Video überschreitet das 50-MB-Limit des Free-Tarifs.'; end if;
   end loop;
   fid:=nullif(payload->>'figure','')::uuid;
   if fid is null then insert into cloud_figures(owner_id) values(me) returning id into fid;
   elsif not exists(select 1 from cloud_figures where id=fid and owner_id=me) then raise exception 'Nur eigene Figuren können bearbeitet werden.'; end if;
   insert into cloud_jobs(owner_id,figure_id) values(me,fid) returning * into job;
   for item in select * from jsonb_array_elements(payload->'videos') loop
     mid:=gen_random_uuid();
     insert into cloud_media(id,figure_id,owner_id,job_id,path,bytes,mime) values(mid,fid,me,job.id,me::text||'/'||mid::text,cfg.file_limit,item->>'type');
     ids:=ids||jsonb_build_array(jsonb_build_object('id',mid,'path',me::text||'/'||mid::text));
   end loop;
   return jsonb_build_object('job',job.id,'figure',fid,'media',ids);
 elsif action='commit' then
   jid:=(payload->>'job')::uuid;
   select * into job from cloud_jobs where id=jid and owner_id=me for update;
   if job.id is null or job.expires_at<now() or not who.upload_enabled then raise exception 'Upload abgelaufen oder gesperrt.'; end if;
   n:=jsonb_array_length(payload->'videos');
   if n<>(select count(*) from cloud_media where job_id=jid) or n=0 then raise exception 'Upload unvollständig.'; end if;
   select count(distinct(v->>'id')) into count_ids from jsonb_array_elements(payload->'videos') v;
   if n<>count_ids then raise exception 'Video doppelt.'; end if;
   for item in select * from jsonb_array_elements(payload->'videos') loop
     select * into med from cloud_media where id=(item->>'id')::uuid and job_id=jid and ready;
     if med.id is null or length(coalesce(item->>'name',''))>160 then raise exception 'Upload nicht verifiziert.'; end if;
     videos:=videos||jsonb_build_array(jsonb_build_object('id',med.id,'name',coalesce(item->>'name',''),'size',med.bytes,'type',med.mime));
   end loop;
   if exists(select 1 from jsonb_array_elements(payload->'tags') t where jsonb_typeof(t)<>'string' or length(t#>>'{}')>160) then raise exception 'Ungültige Tags.'; end if;
   if payload ? 'public_allowed' then
     if jsonb_typeof(payload->'public_allowed')<>'boolean' then raise exception 'Ungültige Veröffentlichungsfreigabe.'; end if;
     update cloud_figures set public_allowed=(payload->>'public_allowed')::boolean where id=job.figure_id and owner_id=me;
   end if;
   insert into cloud_revisions(figure_id,title,description,tags,videos) values(job.figure_id,trim(payload->>'title'),coalesce(payload->>'description',''),coalesce(payload->'tags','[]'),videos) returning id into rid;
   if payload->'poster' is not null and payload->'poster'<>'null'::jsonb then perform cloud_save_poster(rid,payload->'poster'->>'data',coalesce(payload->'poster'->>'kind','local')); end if;
   -- Update every linked library independently; moderated libraries keep their old version.
   update cloud_entries e set published_id=case when not l.moderated or cloud_can_manage_library(l.id) then rid else e.published_id end,
     pending_id=case when l.moderated and not cloud_can_manage_library(l.id) then rid else null end
     from cloud_libraries l where l.id=e.library_id and e.figure_id=job.figure_id;
   update cloud_media set job_id=null where job_id=jid; delete from cloud_jobs where id=jid;
   return jsonb_build_object('revision',rid,'figure',job.figure_id);
 else raise exception 'Unbekannte Cloud-Aktion.';
 end if;
 return jsonb_build_object('ok',true);
end $$;
commit;
