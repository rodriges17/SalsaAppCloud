begin;
-- Scheduled production maintenance is optional in local test Postgres distributions.
do $setup$
begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') and exists(select 1 from pg_available_extensions where name='pg_net') then
   execute 'create extension if not exists pg_cron';
   execute 'create extension if not exists pg_net with schema extensions';
   execute $secret$select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'cloud_media_maintenance') where not exists(select 1 from vault.secrets where name='cloud_media_maintenance')$secret$;
   execute $fn$create or replace function cloud_private.cloud_maintenance_authorize(token text) returns boolean language sql security definer set search_path='' as 'select length(token)=64 and exists(select 1 from vault.decrypted_secrets where name=''cloud_media_maintenance'' and decrypted_secret=token)'$fn$;
   execute 'revoke all on function cloud_private.cloud_maintenance_authorize(text) from public,anon,authenticated';
   execute 'grant execute on function cloud_private.cloud_maintenance_authorize(text) to service_role';
   execute $fn$create or replace function public.cloud_maintenance_authorize(token text) returns boolean language sql security invoker set search_path='' as 'select cloud_private.cloud_maintenance_authorize(token)'$fn$;
   execute 'revoke all on function public.cloud_maintenance_authorize(text) from public,anon,authenticated';
   execute 'grant execute on function public.cloud_maintenance_authorize(text) to service_role';
   execute $cron$select cron.schedule('cloud-shared-media-maintenance','*/10 * * * *',
     $job$select net.http_post(url:='https://tzaprobvauikssnpiucl.supabase.co/functions/v1/cloud',headers:='{"Content-Type":"application/json"}'::jsonb,
       body:=jsonb_build_object('action','maintenance','payload',jsonb_build_object('token',(select decrypted_secret from vault.decrypted_secrets where name='cloud_media_maintenance'))),timeout_milliseconds:=120000);$job$)$cron$;
 end if;
end $setup$;
commit;
