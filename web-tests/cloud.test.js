import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant insert on storage.objects to authenticated;`);
for (const name of (await readdir('supabase/migrations')).sort()) await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002', C = '00000000-0000-4000-8000-000000000003';
await db.query('insert into auth.users values ($1,$2),($3,$4),($5,$6)', [A,'admin@example.test',B,'writer@example.test',C,'reader@example.test']);
async function role(id, name = id ? 'authenticated' : 'anon') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id ?? '',name]); await db.exec(`set role ${name}`); }
async function api(id, action, payload = {}) { await role(id); return (await db.query('select public.cloud_api($1,$2) as result', [action,JSON.stringify(payload)])).rows[0].result; }
async function root(sql, params = []) { await role(null,'service_role'); await db.exec('reset role'); return db.query(sql,params); }
await root('select cloud_bootstrap($1,$2)', [A,'admin@example.test']);
await api(A,'admin_person',{id:B,enabled:true,quota:250000000}); await api(A,'admin_person',{id:C,enabled:false,quota:0});
let library, other, figure, revision, nextRevision;
const videos = [{type:'video/mp4',size:3}];
async function uploaded(who, fid, publicAllowed) {
 const job = await api(who,'reserve',{figure:fid,videos});
 await root("insert into storage.objects(bucket_id,name,metadata) values ('salsa-cloud',$1,$2)", [job.media[0].path,JSON.stringify({size:3,mimetype:'video/mp4'})]);
 await root('select cloud_finish_media($1,$2)',[job.media[0].id,who]);
 const done = await api(who,'commit',{job:job.job,...(publicAllowed===undefined?{}:{public_allowed:publicAllowed}),title:'Drehung',description:'Test',tags:['Salsa'],videos:[{id:job.media[0].id,name:'Führung'}]}); return done;
}
test('cloud: anonymous users cannot bootstrap, change limits or create libraries', async () => {
 await assert.rejects(api(null,'library_save',{title:'Bad',visibility:'public',collaborative:true,moderated:false}));
 await assert.rejects(api(C,'admin_limit',{bytes:1000000000}));
 await role(C); await assert.rejects(db.query('select cloud_bootstrap($1,$2)',[C,'bad@test']));
 await assert.rejects(db.query("insert into cloud_people(id,email,is_admin) values ($1,'bad@test',true)",[C]));
});
test('cloud: public/private visibility, library roles and platform approval are independent', async () => {
 library=(await api(A,'library_save',{title:'Private',visibility:'private',collaborative:true,moderated:true})).id;
 await assert.rejects(api(null,'library',{id:library}));
 await api(A,'member',{library,email:'writer@example.test',role:'contributor'});
 await assert.rejects(api(A,'member',{library,email:'reader@example.test',role:'contributor'}));
 await api(A,'member',{library,email:'reader@example.test',role:'reader'});
 assert.equal((await api(C,'library',{id:library})).contribute,false);
 assert.equal((await api(B,'library',{id:library})).contribute,true);
 await assert.rejects(api(C,'reserve',{videos}));
 other=(await api(A,'library_save',{title:'Public',visibility:'public',collaborative:true,moderated:false})).id;
 assert.equal((await api(null,'library',{id:other})).library.title,'Public');
});
test('cloud: quota reserves maximum file size; client cannot underdeclare or finalize media', async () => {
 await assert.rejects(api(B,'reserve',{videos:[{size:50000001,type:'video/mp4'}]}));
 const job=await api(B,'reserve',{videos:Array(5).fill(videos[0])});
 assert.equal((await api(B,'state')).me.used,250000000);
 await assert.rejects(api(B,'reserve',{videos}));
 await role(C); await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values ('salsa-cloud',$1,'{}')",[job.media[0].path]));
 await role(B); await assert.rejects(db.query('select cloud_finish_media($1,$2)',[job.media[0].id,B]));
 await assert.rejects(api(B,'commit',{job:job.job,title:'Bad',tags:[],videos:job.media.map(m=>({id:m.id,name:''}))}));
 await root('select cloud_release_job($1)',[job.job]);
 assert.equal((await api(B,'state')).me.used,0);
});
test('cloud: pending revisions remain private and only library managers can approve', async () => {
 const done=await uploaded(B);figure=done.figure;revision=done.revision;
 await api(B,'attach',{library,revision});
 assert.equal((await api(C,'library',{id:library})).entries.length,0);
 await assert.rejects(api(C,'media',{revision,media:(await api(B,'state')).own_figures[0].revisions[0].videos[0].id}));
 await assert.rejects(api(B,'review',{library,figure,accept:true}));
 await api(A,'review',{library,figure,accept:true});
 assert.equal((await api(C,'library',{id:library})).entries[0].published.id,revision);
});
test('cloud: public publication requires figure-owner consent and toggling visibility cannot bypass it', async () => {
 await assert.rejects(api(A,'attach',{library:other,revision}));
 await assert.rejects(api(A,'public_permission',{figure,allowed:true}));
 await api(A,'library_save',{id:library,title:'Now public',visibility:'public',collaborative:true,moderated:true});
 assert.equal((await api(null,'library',{id:library})).entries.length,0);
 await api(B,'public_permission',{figure,allowed:true});
 await api(A,'attach',{library:other,revision});
 assert.equal((await api(null,'library',{id:other})).entries[0].published.id,revision);
 await api(B,'public_permission',{figure,allowed:false});
 assert.equal((await api(null,'library',{id:other})).entries.length,0);
 await api(B,'public_permission',{figure,allowed:true});
});
test('cloud: one figure serves multiple libraries, moderated updates retain their approved version', async () => {
 nextRevision=(await uploaded(B,figure)).revision;
 assert.equal((await api(null,'library',{id:other})).entries[0].published.id,nextRevision);
 const entry=(await api(A,'library',{id:library})).entries[0];
 assert.equal(entry.published.id,revision); assert.equal(entry.pending.id,nextRevision);
 await api(A,'review',{library,figure,accept:false});
 assert.equal((await api(A,'library',{id:library})).entries[0].published.id,revision);
});
test('cloud: publication consent and a new revision are committed atomically', async () => {
 nextRevision=(await uploaded(B,figure,false)).revision;
 assert.equal((await api(null,'library',{id:other})).entries.length,0);
 assert.equal((await api(B,'state')).own_figures[0].public_allowed,false);
 await api(B,'public_permission',{figure,allowed:true});
 assert.equal((await api(null,'library',{id:other})).entries[0].published.id,nextRevision);
});
test('cloud: suspended writers cannot upload; library deletion does not delete shared media', async () => {
 await api(A,'admin_person',{id:B,enabled:false,quota:250000000});
 await assert.rejects(api(B,'reserve',{videos}));
 await assert.rejects(api(B,'attach',{library:other,revision}));
 await api(A,'library_delete',{id:library});
 assert.equal((await api(null,'library',{id:other})).entries[0].published.id,nextRevision);
});
test('cloud: cleanup cannot release quota while a storage object still exists', async () => {
 const own=(await api(B,'state')).own_figures[0]; const media=own.revisions[0].videos[0];
 await assert.rejects(root('select cloud_delete_figure($1,$2)',[figure,C]));
 await assert.rejects(root('select cloud_delete_figure($1,$2)',[figure,B]));
 await root("delete from storage.objects where name in (select path from cloud_media where figure_id=$1)",[figure]);
 await root('select cloud_delete_figure($1,$2)',[figure,B]);
 assert.equal((await api(B,'state')).me.used,0); assert.equal((await api(null,'library',{id:other})).entries.length,0);
});
