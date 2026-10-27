begin;
create or replace function cloud_private.cloud_api(action text,payload jsonb default '{}') returns jsonb
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
 -- Capture the exact committed content, not a later observation of this figure.
 value:=value||jsonb_build_object('content',(select to_jsonb(r) from cloud_revisions r where id=(value->>'revision')::uuid));
 insert into upload_outcomes(job_id,owner_id,result) values(jid,me,value);
 return value;
end $$;
commit;
