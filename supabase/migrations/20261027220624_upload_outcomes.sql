begin;
-- A receipt is committed in the same transaction as the figure. It contains no
-- video bytes and is available only through the caller's authenticated workflow.
create table cloud_private.upload_outcomes (
 job_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 result jsonb,
 created_at timestamptz not null default now()
);
create index upload_outcomes_owner on cloud_private.upload_outcomes(owner_id);
alter table cloud_private.upload_outcomes enable row level security;
revoke all on cloud_private.upload_outcomes from public,anon,authenticated;

alter function cloud_private.cloud_api(text,jsonb) rename to cloud_api_before_upload_outcomes;
create function cloud_private.cloud_api(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,cloud_private,pg_temp as $$
declare me uuid:=auth.uid(); jid uuid; owner uuid; receipt cloud_private.upload_outcomes; value jsonb;
begin
 if action not in ('commit','upload_status') then return cloud_api_before_upload_outcomes(action,payload); end if;
 if me is null then raise exception 'Bitte anmelden.'; end if;
 jid:=(payload->>'job')::uuid;
 if jid is null then raise exception 'Upload-Vorgang fehlt.'; end if;
 -- Same transaction lock as reserve/commit: a status response cannot race a
 -- commit already running, and a fenced job can never be committed afterwards.
 perform pg_advisory_xact_lock(7193902);
 select * into receipt from upload_outcomes where job_id=jid;
 if found then
  if receipt.owner_id<>me then raise exception 'Keine Berechtigung.'; end if;
  if action='upload_status' then
   if receipt.result is null then return jsonb_build_object('status','not_saved'); end if;
   return jsonb_build_object('status','saved','saved',receipt.result);
  end if;
  if receipt.result is null then raise exception 'Dieser Upload wurde nicht gespeichert. Bitte erneut starten.'; end if;
  return receipt.result;
 end if;
 select owner_id into owner from cloud_jobs where id=jid;
 if owner is not null and owner<>me then raise exception 'Keine Berechtigung.'; end if;
 if action='upload_status' then
  if owner=me then insert into upload_outcomes(job_id,owner_id) values(jid,me); end if;
  return jsonb_build_object('status','not_saved');
 end if;
 value:=cloud_api_before_upload_outcomes(action,payload);
 insert into upload_outcomes(job_id,owner_id,result) values(jid,me,value);
 return value;
end $$;
revoke all on function cloud_private.cloud_api(text,jsonb) from public;
grant execute on function cloud_private.cloud_api(text,jsonb) to anon,authenticated,service_role;
revoke all on function cloud_private.cloud_api_before_upload_outcomes(text,jsonb) from public,anon,authenticated;
commit;
