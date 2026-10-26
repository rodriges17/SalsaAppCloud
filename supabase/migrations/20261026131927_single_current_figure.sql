begin;
-- Stable identity, one mutable content row, and a compare-and-swap token (no history).
alter table public.cloud_figures add column content_token uuid not null default gen_random_uuid();
alter table public.cloud_jobs add column expected_token uuid;
update public.cloud_jobs j set expected_token=f.content_token from public.cloud_figures f where f.id=j.figure_id;
create or replace function cloud_private.cloud_can_edit_figure(fid uuid) returns boolean language sql stable security definer set search_path=public,cloud_private,pg_temp as $$
 select exists(select 1 from cloud_figures f where f.id=fid and f.deleted_at is null and (f.owner_id=auth.uid() or cloud_is_admin()))
$$;
-- Retain identity aliases only, never historical figure content.
alter table public.cloud_revisions add column legacy_ids uuid[] not null default '{}';
update public.cloud_revisions r set legacy_ids=(select array_agg(id) from public.cloud_revisions where figure_id=r.figure_id);
-- Normalize references before removing old snapshots.
update cloud_entries e set published_id=case when published_id is not null then (select id from cloud_revisions where figure_id=e.figure_id order by created_at desc,id desc limit 1) end,
 pending_id=case when published_id is null and pending_id is not null then (select id from cloud_revisions where figure_id=e.figure_id order by created_at desc,id desc limit 1) end;
delete from cloud_revisions r where r.id<>(select id from cloud_revisions where figure_id=r.figure_id order by created_at desc,id desc limit 1);
create unique index cloud_one_current_content on cloud_revisions(figure_id);
create or replace function cloud_private.cloud_reserve_shared(payload jsonb) returns jsonb language plpgsql security invoker set search_path=public,cloud_private,pg_temp as $$
declare me uuid:=auth.uid(); who cloud_people; cfg cloud_settings; fid uuid; job cloud_jobs; item jsonb; med cloud_media; mid uuid; result jsonb:='[]'; extra bigint:=0;
begin
 select * into who from cloud_people where id=me;
 if not coalesce(who.upload_enabled,false) then raise exception 'Uploads sind nicht freigeschaltet.'; end if;
 if jsonb_typeof(payload->'videos') is distinct from 'array' or jsonb_array_length(payload->'videos') not between 1 and 100 then raise exception 'Bitte 1 bis 100 Videos auswählen.'; end if;
 perform pg_advisory_xact_lock(7193902);
 select * into cfg from cloud_settings;
 fid:=nullif(payload->>'figure','')::uuid;
 if fid is null then insert into cloud_figures(owner_id) values(me) returning id into fid;
 elsif not cloud_can_edit_figure(fid) then raise exception 'Keine Berechtigung.'; end if;
 if nullif(payload->>'figure','') is not null and exists(select 1 from cloud_revisions where figure_id=fid) and
 (select content_token from cloud_figures where id=fid) is distinct from nullif(payload->>'expected_token','')::uuid then
 raise exception 'Die Cloudfigur wurde inzwischen geändert. Bitte neu laden.'; end if;
 insert into cloud_jobs(owner_id,figure_id,explicit_variant,expected_token) values(me,fid,coalesce((payload->>'variant')::boolean,false),(select content_token from cloud_figures where id=fid)) returning * into job;
 for item in select * from jsonb_array_elements(payload->'videos') loop
   if (item->>'size')::bigint not between 1 and cfg.file_limit then raise exception 'Ein Video überschreitet das 50-MB-Limit.'; end if;
   med:=null;
   if nullif(item->>'reuse','') is not null then
     select m.* into med from cloud_media m where m.id=(item->>'reuse')::uuid and m.ready and m.job_id is null and exists(
       select 1 from cloud_revisions r,jsonb_array_elements(r.videos) v where (v->>'id')::uuid=m.id and cloud_can_read_revision(r.id));
     if med.id is null then raise exception 'Kein Zugriff auf dieses Video.'; end if;
   end if;
   mid:=gen_random_uuid();
   if med.id is not null then
     insert into cloud_media(id,figure_id,owner_id,job_id,path,bytes,mime,ready,content_hash) values(mid,fid,me,job.id,med.path,med.bytes,med.mime,true,med.content_hash);
     result:=result||jsonb_build_array(jsonb_build_object('id',mid,'reused',true));
   else
     insert into cloud_media(id,figure_id,owner_id,job_id,path,bytes,mime) values(mid,fid,me,job.id,me::text||'/'||mid::text,cfg.file_limit,item->>'type');
     result:=result||jsonb_build_array(jsonb_build_object('id',mid,'path',me::text||'/'||mid::text,'reused',false));
   end if;
 end loop;
 if cloud_used_bytes()>cfg.total_limit or cloud_used_bytes(me)>who.quota then raise exception 'Nicht genug freier Speicher für den Upload. Laufende Uploads zählen mit.'; end if;
 return jsonb_build_object('job',job.id,'figure',fid,'media',result);
end $$;
create or replace function cloud_private.cloud_figure_action(action text,payload jsonb) returns jsonb language plpgsql security invoker set search_path=public,cloud_private,pg_temp as $$
declare me uuid:=auth.uid(); fid uuid; rid uuid; source cloud_revisions; fig cloud_figures; item jsonb; med cloud_media; mid uuid; videos jsonb:='[]'; editors jsonb;
begin
 if me is null or not exists(select 1 from cloud_people where id=me) then raise exception 'Bitte anmelden.'; end if;
 perform pg_advisory_xact_lock(7193902);
 fid:=nullif(payload->>'figure','')::uuid;
 if action='duplicates' then
 return jsonb_build_object('matches',coalesce((select jsonb_agg(jsonb_build_object('figure',r.figure_id,'revision',r.id,'title',r.title,'media',m.id,'hash',m.content_hash))
 from cloud_revisions r join cloud_figures f on f.id=r.figure_id cross join lateral jsonb_array_elements(r.videos) v join cloud_media m on m.id=(v->>'id')::uuid
 where f.deleted_at is null and r.id=(select id from cloud_revisions where figure_id=f.id order by created_at desc,id desc limit 1)
 and m.ready and m.content_hash in (select jsonb_array_elements_text(payload->'hashes')) and cloud_can_read_revision(r.id)),'[]'));
 elsif action='variant' then
 rid:=(payload->>'revision')::uuid;
 if not cloud_can_read_revision(rid) or not exists(select 1 from cloud_people where id=me and upload_enabled) then raise exception 'Keine Berechtigung.'; end if;
 select * into source from cloud_revisions where id=rid;
 insert into cloud_figures(owner_id) values(me) returning id into fid;
 for item in select * from jsonb_array_elements(source.videos) loop
 select * into med from cloud_media where id=(item->>'id')::uuid;
 mid:=gen_random_uuid();
 insert into cloud_media(id,figure_id,owner_id,path,bytes,mime,ready,content_hash) values(mid,fid,me,med.path,med.bytes,med.mime,true,med.content_hash);
 videos:=videos||jsonb_build_array(item||jsonb_build_object('id',mid));
 end loop;
 insert into cloud_revisions(figure_id,title,description,tags,videos) values(fid,source.title,source.description,source.tags,videos) returning id into rid;
 if exists(select 1 from revision_posters where revision_id=source.id) then perform cloud_save_poster(rid,(select replace(encode(image,'base64'),E'\n','') from revision_posters where revision_id=source.id),(select kind from revision_posters where revision_id=source.id)); end if;
 if cloud_used_bytes(me)>(select quota from cloud_people where id=me) then raise exception 'Nicht genug freier Speicher.'; end if;
 return jsonb_build_object('figure',fid,'revision',rid);
 end if;
 select * into fig from cloud_figures where id=fid for update;
 if fig.owner_id is distinct from me and not cloud_is_admin() then raise exception 'Nur der Figurenbesitzer darf diese Aktion ausführen.'; end if;
 if action='delete_preview' then
 return jsonb_build_object('libraries',coalesce((select jsonb_agg(l.title) from cloud_entries e join cloud_libraries l on l.id=e.library_id where e.figure_id=fid),'[]'));
 elsif action='delete_figure' then
 if fig.content_token is distinct from nullif(payload->>'expected_token','')::uuid then raise exception 'Die Cloudfigur wurde inzwischen geändert. Bitte neu laden.'; end if;
 delete from cloud_entries where figure_id=fid;
 if exists(select 1 from cloud_jobs where figure_id=fid) then raise exception 'Für diese Figur läuft noch ein Upload.'; end if;
 update cloud_figures set deleted_at=coalesce(deleted_at,now()) where id=fid;
 else raise exception 'Unbekannte Aktion.';
 end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function cloud_private.cloud_api_before_library_order(action text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
declare
 me uuid:=auth.uid(); admin boolean:=cloud_is_admin(); who cloud_people; lib cloud_libraries; fig cloud_figures; rev cloud_revisions; job cloud_jobs; med cloud_media; cfg cloud_settings;
 lid uuid; fid uuid; rid uuid; uid uuid; jid uuid; mid uuid; item jsonb; result jsonb; ids jsonb:='[]'; videos jsonb:='[]'; n int; count_ids int; used bigint; reserved bigint;
begin
 select * into who from cloud_people where id=me;
 if action in ('duplicates','variant','delete_figure','delete_preview') then return cloud_figure_action(action,payload); end if;
 if action in ('editor','restore_figure') then raise exception 'Diese Funktion ist nicht mehr verfügbar.'; end if;
 if action='reserve' then return cloud_reserve_shared(payload); end if;
 if action='state' then
   return jsonb_build_object('me',case when who.id is null then null else to_jsonb(who)||jsonb_build_object('used',cloud_used_bytes(me)) end,
   'settings',case when admin then (select to_jsonb(s)||jsonb_build_object('used',cloud_used_bytes()) from cloud_settings s) else null end,
   'people',case when admin then coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('used',cloud_used_bytes(p.id))) from cloud_people p),'[]') else '[]'::jsonb end,
   'libraries',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('manage',cloud_can_manage_library(l.id),'contribute',cloud_can_contribute(l.id))) from cloud_libraries l where cloud_can_read_library(l.id)),'[]'),
   'trash',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'deleted_at',f.deleted_at,'title',(select title from cloud_revisions where figure_id=f.id order by created_at desc,id desc limit 1))) from cloud_figures f where f.owner_id=me and f.deleted_at>now()-interval '30 days'),'[]'),
   'own_figures',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('libraries',coalesce((select jsonb_agg(l.title) from cloud_entries e join cloud_libraries l on l.id=e.library_id where e.figure_id=f.id),'[]'),'revisions',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from cloud_revisions r where r.figure_id=f.id),'[]'))) from cloud_figures f where f.deleted_at is null and (f.owner_id=me or cloud_can_edit_figure(f.id))),'[]'));
 elsif action='library' then
   lid:=(payload->>'id')::uuid;
   if not cloud_can_read_library(lid) then raise exception 'Kein Zugriff auf diese Bibliothek.'; end if;
   select * into lib from cloud_libraries where id=lid;
   return jsonb_build_object('library',to_jsonb(lib),'manage',cloud_can_manage_library(lid),'contribute',cloud_can_contribute(lid),
   'members',case when cloud_can_manage_library(lid) then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'upload_enabled',p.upload_enabled,'role',m.role)) from cloud_members m join cloud_people p on p.id=m.user_id where m.library_id=lid),'[]') else '[]'::jsonb end,
   'entries',coalesce((select jsonb_agg(jsonb_build_object('figure_id',e.figure_id,'owner_id',f.owner_id,'public_allowed',f.public_allowed,'can_edit',cloud_can_edit_figure(f.id),'published',case when cloud_can_read_revision(e.published_id) then (select to_jsonb(r) from cloud_revisions r where r.id=e.published_id) else null end,'pending',case when cloud_can_read_revision(e.pending_id) then (select to_jsonb(r) from cloud_revisions r where r.id=e.pending_id) else null end)) from cloud_entries e join cloud_figures f on f.id=e.figure_id where e.library_id=lid and (cloud_can_manage_library(lid) or f.owner_id=me or (e.published_id is not null and (lib.visibility='private' or f.public_allowed)))),'[]'));
 elsif action='poster_get' then
   rid:=(payload->>'revision')::uuid;
   if not cloud_can_read_revision(rid) then raise exception 'Kein Zugriff auf dieses Vorschaubild.'; end if;
   select * into rev from cloud_revisions where id=rid;
   select * into fig from cloud_figures where id=rev.figure_id;
   return jsonb_build_object('poster',(select replace(encode(image,'base64'),E'\n','') from revision_posters where revision_id=rid),
     'kind',(select kind from revision_posters where revision_id=rid),
     'can_write',coalesce(cloud_can_edit_figure(fig.id) and who.upload_enabled,false));
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
   select id into rid from cloud_revisions where figure_id=fig.id order by created_at desc,id desc limit 1;
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
 elsif action='commit' then
   perform pg_advisory_xact_lock(7193902);
   jid:=(payload->>'job')::uuid;
   select * into job from cloud_jobs where id=jid and owner_id=me for update;
   if not cloud_can_edit_figure(job.figure_id) then raise exception 'Keine Berechtigung.'; end if;
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
   if not job.explicit_variant and not exists(select 1 from cloud_revisions where figure_id=job.figure_id) and exists(
     select 1 from cloud_media fresh join cloud_media old on old.path=fresh.path and old.figure_id<>fresh.figure_id
     join cloud_revisions existing on existing.figure_id=old.figure_id
     where fresh.job_id=jid and fresh.content_hash is not null and old.job_id is null and cloud_can_read_revision(existing.id)
     and exists(select 1 from jsonb_array_elements(existing.videos) v where (v->>'id')::uuid=old.id)) then
     raise exception 'Dieses Video gehört bereits zu einer zugänglichen Figur. Bitte bestehende Figur verwenden oder ausdrücklich eine eigene Variante erstellen.';
   end if;
   if exists(select 1 from jsonb_array_elements(payload->'tags') t where jsonb_typeof(t)<>'string' or length(t#>>'{}')>160) then raise exception 'Ungültige Tags.'; end if;
   if payload ? 'public_allowed' and exists(select 1 from cloud_figures where id=job.figure_id and owner_id=me) then
     if jsonb_typeof(payload->'public_allowed')<>'boolean' then raise exception 'Ungültige Veröffentlichungsfreigabe.'; end if;
     update cloud_figures set public_allowed=(payload->>'public_allowed')::boolean where id=job.figure_id and owner_id=me;
   end if;
   select * into fig from cloud_figures where id=job.figure_id for update;
   if fig.content_token is distinct from job.expected_token then raise exception 'Die Cloudfigur wurde inzwischen geändert. Bitte neu laden.'; end if;
   insert into cloud_revisions(figure_id,title,description,tags,videos) values(job.figure_id,trim(payload->>'title'),coalesce(payload->>'description',''),coalesce(payload->'tags','[]'),videos)
   on conflict(figure_id) do update set title=excluded.title,description=excluded.description,tags=excluded.tags,videos=excluded.videos,created_at=now(),retired_at=null returning id into rid;
   delete from poster_refs where revision_id=rid;
   update cloud_figures set content_token=gen_random_uuid() where id=job.figure_id;
   if payload->'poster' is not null and payload->'poster'<>'null'::jsonb then perform cloud_save_poster(rid,payload->'poster'->>'data',coalesce(payload->'poster'->>'kind','local')); end if;
   -- Moderation approves initial membership, never a divergent copy of a figure.
   update cloud_entries set published_id=case when published_id is not null then rid end,
     pending_id=case when published_id is null and pending_id is not null then rid end
     where figure_id=job.figure_id;
   update cloud_media set job_id=null where job_id=jid; delete from cloud_jobs where id=jid;
   perform cloud_collect_trash();
   return jsonb_build_object('revision',rid,'figure',job.figure_id);
 else raise exception 'Unbekannte Cloud-Aktion.';
 end if;
 return jsonb_build_object('ok',true);
end $$;
-- No additional editors survive this change.
drop table cloud_private.figure_editors;
-- Removed entry points remain denied even for older clients.
create or replace function cloud_private.cloud_delete_figure(fid uuid,uid uuid) returns void language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
begin raise exception 'Bitte die aktuelle App zum Löschen verwenden.'; end $$;
-- Release superseded media references immediately; shared physical files stay protected.
select cloud_private.cloud_collect_trash();
commit;
