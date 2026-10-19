begin;
create schema cloud_private;
grant usage on schema cloud_private to anon,authenticated,service_role;
create table public.cloud_settings (id boolean primary key default true check(id), total_limit bigint not null default 900000000 check(total_limit between 50000000 and 1000000000), file_limit bigint not null default 50000000 check(file_limit between 1 and 50000000));
insert into public.cloud_settings default values;
create table public.cloud_people (id uuid primary key references auth.users(id), email text not null, is_admin boolean not null default false, upload_enabled boolean not null default false, quota bigint not null default 250000000 check(quota>=0));
create table public.cloud_libraries (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.cloud_people, title text not null check(length(trim(title)) between 1 and 160), description text not null default '' check(length(description)<=10000), visibility text not null default 'private' check(visibility in ('public','private')), collaborative boolean not null default false, moderated boolean not null default true);
create table public.cloud_members (library_id uuid references public.cloud_libraries on delete cascade, user_id uuid references public.cloud_people, role text not null check(role in ('reader','contributor')), primary key(library_id,user_id));
create table public.cloud_figures (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.cloud_people, public_allowed boolean not null default false);
create table public.cloud_jobs (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.cloud_people, figure_id uuid not null references public.cloud_figures, expires_at timestamptz not null default now()+interval '2 hours');
create table public.cloud_media (id uuid primary key default gen_random_uuid(), figure_id uuid not null references public.cloud_figures, owner_id uuid not null references public.cloud_people, job_id uuid references public.cloud_jobs, path text unique not null, bytes bigint not null check(bytes>0), ready boolean not null default false, mime text not null check(mime in ('video/mp4','video/quicktime','video/x-m4v','video/webm','video/ogg')));
create table public.cloud_revisions (id uuid primary key default gen_random_uuid(), figure_id uuid not null references public.cloud_figures, title text not null check(length(trim(title)) between 1 and 160), description text not null default '' check(length(description)<=100000), tags jsonb not null default '[]' check(jsonb_typeof(tags)='array' and jsonb_array_length(tags)<=100), videos jsonb not null check(jsonb_typeof(videos)='array' and jsonb_array_length(videos) between 1 and 100), created_at timestamptz not null default now());
create table public.cloud_entries (library_id uuid references public.cloud_libraries on delete cascade, figure_id uuid references public.cloud_figures, published_id uuid references public.cloud_revisions, pending_id uuid references public.cloud_revisions, primary key(library_id,figure_id));
create index on public.cloud_media(owner_id);
create index on public.cloud_revisions(figure_id);
create index on public.cloud_entries(figure_id);
create index on public.cloud_members(user_id);

-- Tables are never writable through the public Data API. All decisions live below.
alter table public.cloud_settings enable row level security;
alter table public.cloud_people enable row level security;
alter table public.cloud_libraries enable row level security;
alter table public.cloud_members enable row level security;
alter table public.cloud_figures enable row level security;
alter table public.cloud_jobs enable row level security;
alter table public.cloud_media enable row level security;
alter table public.cloud_revisions enable row level security;
alter table public.cloud_entries enable row level security;
revoke all on public.cloud_settings,public.cloud_people,public.cloud_libraries,public.cloud_members,public.cloud_figures,public.cloud_jobs,public.cloud_media,public.cloud_revisions,public.cloud_entries from anon, authenticated;
grant all on public.cloud_settings,public.cloud_people,public.cloud_libraries,public.cloud_members,public.cloud_figures,public.cloud_jobs,public.cloud_media,public.cloud_revisions,public.cloud_entries to service_role;

create function cloud_private.cloud_is_admin() returns boolean language sql stable security definer set search_path=public,cloud_private,pg_temp as $$ select coalesce((select is_admin from cloud_people where id=auth.uid()),false) $$;
create function cloud_private.cloud_can_read_library(lid uuid) returns boolean language sql stable security definer set search_path=public,cloud_private,pg_temp as $$ select exists(select 1 from cloud_libraries l where l.id=lid and (l.visibility='public' or l.owner_id=auth.uid() or cloud_is_admin() or exists(select 1 from cloud_members m where m.library_id=l.id and m.user_id=auth.uid()))) $$;
create function cloud_private.cloud_can_manage_library(lid uuid) returns boolean language sql stable security definer set search_path=public,cloud_private,pg_temp as $$ select exists(select 1 from cloud_libraries where id=lid and (owner_id=auth.uid() or cloud_is_admin())) $$;
create function cloud_private.cloud_can_contribute(lid uuid) returns boolean language sql stable security definer set search_path=public,cloud_private,pg_temp as $$ select exists(select 1 from cloud_people p where p.id=auth.uid() and p.upload_enabled) and (cloud_can_manage_library(lid) or exists(select 1 from cloud_libraries l join cloud_members m on m.library_id=l.id where l.id=lid and l.collaborative and m.user_id=auth.uid() and m.role='contributor')) $$;
create function cloud_private.cloud_can_read_revision(rid uuid) returns boolean language sql stable security definer set search_path=public,cloud_private,pg_temp as $$
select exists(select 1 from cloud_revisions r join cloud_figures f on f.id=r.figure_id where r.id=rid and (f.owner_id=auth.uid() or cloud_is_admin() or exists(select 1 from cloud_entries e join cloud_libraries l on l.id=e.library_id where e.figure_id=f.id and ((e.published_id=r.id and cloud_can_read_library(l.id) and (l.visibility='private' or f.public_allowed)) or (e.pending_id=r.id and cloud_can_manage_library(l.id)))))) $$;
create function cloud_private.cloud_can_upload_path(object_path text) returns boolean language sql stable security definer set search_path=public,cloud_private,pg_temp as $$ select exists(select 1 from cloud_media m join cloud_jobs j on j.id=m.job_id join cloud_people p on p.id=m.owner_id where m.path=object_path and m.owner_id=auth.uid() and not m.ready and j.expires_at>now() and p.upload_enabled) $$;
revoke all on function cloud_private.cloud_is_admin(),cloud_private.cloud_can_read_library(uuid),cloud_private.cloud_can_manage_library(uuid),cloud_private.cloud_can_contribute(uuid),cloud_private.cloud_can_read_revision(uuid),cloud_private.cloud_can_upload_path(text) from public;
grant execute on function cloud_private.cloud_can_upload_path(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('salsa-cloud','salsa-cloud',false,50000000,array['video/mp4','video/quicktime','video/x-m4v','video/webm','video/ogg']);
create policy "reserved upload only" on storage.objects for insert to authenticated with check(bucket_id='salsa-cloud' and cloud_private.cloud_can_upload_path(name));
-- No SELECT/UPDATE/DELETE storage policies: read URLs and cleanup require the Edge Function.

create function cloud_private.cloud_bootstrap(uid uuid, mail text) returns void language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
begin
 perform pg_advisory_xact_lock(7193901);
 if exists(select 1 from cloud_people where is_admin) then raise exception 'Administrator already exists'; end if;
 insert into cloud_people(id,email,is_admin,upload_enabled,quota) values(uid,mail,true,true,500000000);
end $$;
revoke all on function cloud_private.cloud_bootstrap(uuid,text) from public, anon, authenticated;
grant execute on function cloud_private.cloud_bootstrap(uuid,text) to service_role;

create function cloud_private.cloud_api(action text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
declare
 me uuid:=auth.uid(); admin boolean:=cloud_is_admin(); who cloud_people; lib cloud_libraries; fig cloud_figures; rev cloud_revisions; job cloud_jobs; med cloud_media; cfg cloud_settings;
 lid uuid; fid uuid; rid uuid; uid uuid; jid uuid; mid uuid; item jsonb; result jsonb; ids jsonb:='[]'; videos jsonb:='[]'; n int; count_ids int; used bigint; reserved bigint;
begin
 select * into who from cloud_people where id=me;
 if action='state' then
   return jsonb_build_object('me',case when who.id is null then null else to_jsonb(who)||jsonb_build_object('used',coalesce((select sum(bytes) from cloud_media where owner_id=me),0)) end,
   'settings',case when admin then (select to_jsonb(s)||jsonb_build_object('used',coalesce((select sum(bytes) from cloud_media),0)) from cloud_settings s) else null end,
   'people',case when admin then coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('used',coalesce((select sum(bytes) from cloud_media where owner_id=p.id),0))) from cloud_people p),'[]') else '[]'::jsonb end,
   'libraries',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('manage',cloud_can_manage_library(l.id),'contribute',cloud_can_contribute(l.id))) from cloud_libraries l where cloud_can_read_library(l.id)),'[]'),
   'own_figures',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('revisions',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from cloud_revisions r where r.figure_id=f.id),'[]'))) from cloud_figures f where f.owner_id=me),'[]'));
 elsif action='library' then
   lid:=(payload->>'id')::uuid;
   if not cloud_can_read_library(lid) then raise exception 'Kein Zugriff auf diese Bibliothek.'; end if;
   select * into lib from cloud_libraries where id=lid;
   return jsonb_build_object('library',to_jsonb(lib),'manage',cloud_can_manage_library(lid),'contribute',cloud_can_contribute(lid),
   'members',case when cloud_can_manage_library(lid) then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'upload_enabled',p.upload_enabled,'role',m.role)) from cloud_members m join cloud_people p on p.id=m.user_id where m.library_id=lid),'[]') else '[]'::jsonb end,
   'entries',coalesce((select jsonb_agg(jsonb_build_object('figure_id',e.figure_id,'owner_id',f.owner_id,'public_allowed',f.public_allowed,'published',case when cloud_can_read_revision(e.published_id) then (select to_jsonb(r) from cloud_revisions r where r.id=e.published_id) else null end,'pending',case when cloud_can_read_revision(e.pending_id) then (select to_jsonb(r) from cloud_revisions r where r.id=e.pending_id) else null end)) from cloud_entries e join cloud_figures f on f.id=e.figure_id where e.library_id=lid and (cloud_can_manage_library(lid) or f.owner_id=me or (e.published_id is not null and (lib.visibility='private' or f.public_allowed)))),'[]'));
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
   if (payload->>'quota')::bigint<coalesce((select sum(bytes) from cloud_media where owner_id=uid),0) then raise exception 'Limit kleiner als belegter Speicher.'; end if;
   insert into cloud_people(id,email,upload_enabled,quota) select id,email,(payload->>'enabled')::boolean,(payload->>'quota')::bigint from auth.users where id=uid on conflict(id) do update set upload_enabled=excluded.upload_enabled,quota=excluded.quota;
 elsif action='admin_limit' then
   if not admin then raise exception 'Keine Berechtigung.'; end if;
   perform pg_advisory_xact_lock(7193902);
   if (payload->>'bytes')::bigint<coalesce((select sum(bytes) from cloud_media),0) then raise exception 'Limit kleiner als belegter Speicher.'; end if;
   update cloud_settings set total_limit=(payload->>'bytes')::bigint;
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
   if reserved+coalesce((select sum(bytes) from cloud_media),0)>cfg.total_limit or reserved+coalesce((select sum(bytes) from cloud_media where owner_id=me),0)>who.quota then raise exception 'Nicht genug freier Speicher für den Upload. Laufende Uploads zählen mit.'; end if;
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
   insert into cloud_revisions(figure_id,title,description,tags,videos) values(job.figure_id,trim(payload->>'title'),coalesce(payload->>'description',''),coalesce(payload->'tags','[]'),videos) returning id into rid;
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
revoke all on function cloud_private.cloud_api(text,jsonb) from public;
grant execute on function cloud_private.cloud_api(text,jsonb) to anon,authenticated,service_role;
create function public.cloud_api(action text, payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select cloud_private.cloud_api(action,payload) $$;
revoke all on function public.cloud_api(text,jsonb) from public;
grant execute on function public.cloud_api(text,jsonb) to anon,authenticated,service_role;
create function public.cloud_bootstrap(uid uuid,mail text) returns void language sql security invoker set search_path='' as $$ select cloud_private.cloud_bootstrap(uid,mail) $$;
revoke all on function public.cloud_bootstrap(uuid,text) from public,anon,authenticated;
grant execute on function public.cloud_bootstrap(uuid,text) to service_role;
commit;
