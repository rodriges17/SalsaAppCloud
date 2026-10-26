import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
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
async function api(id, action, payload = {}) {
 if (['reserve','delete_figure'].includes(action) && payload.figure && !('expected_token' in payload)) {
  const token=(await root('select content_token from cloud_figures where id=$1',[payload.figure])).rows[0]?.content_token; payload={...payload,expected_token:token};
 }
 await role(id); return (await db.query('select public.cloud_api($1,$2) as result', [action,JSON.stringify(payload)])).rows[0].result; }
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
 await api(A,'attach',{library:other,revision}); await api(A,'attach',{library,revision});
});
test('cloud: one figure serves multiple libraries and every reference follows its shared content', async () => {
 nextRevision=(await uploaded(B,figure)).revision;
 assert.equal((await api(null,'library',{id:other})).entries[0].published.id,nextRevision);
 const entry=(await api(A,'library',{id:library})).entries[0];
 assert.equal(entry.published.id,nextRevision); assert.equal(entry.pending,null);
 await api(A,'review',{library,figure,accept:false});
 assert.equal((await api(A,'library',{id:library})).entries[0].published.id,nextRevision);
});
test('cloud: publication consent and a new revision are committed atomically', async () => {
 nextRevision=(await uploaded(B,figure,false)).revision;
 assert.equal((await api(null,'library',{id:other})).entries.length,0);
 assert.equal((await api(B,'state')).own_figures[0].public_allowed,false);
 await api(B,'public_permission',{figure,allowed:true});
 await api(A,'attach',{library:other,revision:nextRevision});
 assert.equal((await api(null,'library',{id:other})).entries[0].published.id,nextRevision);
});
test('cloud: suspended writers cannot upload; library deletion does not delete shared media', async () => {
 await api(A,'admin_person',{id:B,enabled:false,quota:250000000});
 await assert.rejects(api(B,'reserve',{videos}));
 await assert.rejects(api(B,'attach',{library:other,revision}));
 await api(A,'library_delete',{id:library});
 assert.equal((await api(null,'library',{id:other})).entries[0].published.id,nextRevision);
});
test('cloud: referenced figures cannot be deleted; trash retains data and quota for 30 days', async () => {
 await assert.rejects(root('select cloud_delete_figure($1,$2)',[figure,C]));
 await assert.rejects(root('select cloud_delete_figure($1,$2)',[figure,B]));
 await api(A,'detach',{library:other,figure});
 const before=(await api(B,'state')).me.used;
 await api(B,'delete_figure',{figure});
 assert.equal((await api(B,'state')).me.used,before);
 assert.ok((await api(B,'state')).trash.some(f=>f.id===figure));
 await assert.rejects(api(B,'media',{revision:nextRevision,media:(await root('select id from cloud_media where figure_id=$1',[figure])).rows[0].id}));
 await assert.rejects(api(B,'restore_figure',{figure}));
 await root("update cloud_figures set deleted_at=now()-interval '31 days' where id=$1",[figure]);
 const garbage=(await root('select cloud_collect_trash() result')).rows[0].result;
 assert.ok(garbage.paths.length>0);assert.equal((await api(B,'state')).me.used,0);
});

test('cloud posters: owner-only writes, read permissions follow revisions and bytes count toward quota', async () => {
 await api(A,'admin_person',{id:B,enabled:true,quota:250000000});
 const done=await uploaded(B,null,true),rid=done.revision;
 const jpeg=Buffer.from('ffd8ff010203ffd9','hex').toString('base64');
 await assert.rejects(api(null,'poster_get',{revision:rid}));
 await assert.rejects(api(C,'poster_put',{revision:rid,data:jpeg,kind:'local'}));
 await role(B);await assert.rejects(db.query('select * from cloud_private.revision_posters'));
 await assert.rejects(api(B,'poster_put',{revision:rid,data:'abcd',kind:'local'}));
 await assert.rejects(api(B,'poster_put',{revision:rid,data:Buffer.concat([Buffer.from('ffd8ff','hex'),Buffer.alloc(65536),Buffer.from('ffd9','hex')]).toString('base64'),kind:'local'}));
 assert.equal((await api(B,'poster_put',{revision:rid,data:jpeg,kind:'local'})).poster,jpeg);
 assert.equal((await api(B,'state')).me.used,11);
 const pub=(await api(A,'library_save',{title:'Poster library',visibility:'public',collaborative:false,moderated:false})).id;
 await api(A,'attach',{library:pub,revision:rid});
 assert.equal((await api(null,'poster_get',{revision:rid})).poster,jpeg);
 assert.equal((await api(null,'poster_get',{revision:rid})).can_write,false);
 await api(B,'public_permission',{figure:done.figure,allowed:false});await assert.rejects(api(null,'poster_get',{revision:rid}));
 await api(B,'public_permission',{figure:done.figure,allowed:true});
 const replacement=Buffer.from('ffd8ff040506ffd9','hex').toString('base64');
 assert.equal((await api(B,'poster_put',{revision:rid,data:replacement,kind:'local'})).poster,jpeg);
 await assert.rejects(api(A,'admin_person',{id:B,enabled:true,quota:10}));
 await api(A,'admin_person',{id:B,enabled:true,quota:50000010});
 await assert.rejects(api(B,'reserve',{videos}));
 const before=(await api(B,'state')).me.used;
 await api(A,'library_delete',{id:pub});assert.equal((await api(B,'poster_get',{revision:rid})).poster,jpeg);assert.equal((await api(B,'state')).me.used,before);
 await api(B,'delete_figure',{figure:done.figure}); await root("update cloud_figures set deleted_at=now()-interval '31 days' where id=$1",[done.figure]);await root('select cloud_collect_trash()');assert.equal((await api(B,'state')).me.used,0);
});
test('cloud posters: generated frame can upgrade once to the original local image', async () => {
 await api(A,'admin_person',{id:B,enabled:true,quota:250000000});const done=await uploaded(B),rid=done.revision;
 const frame=Buffer.from('ffd8ff01ffd9','hex').toString('base64'),local=Buffer.from('ffd8ff02ffd9','hex').toString('base64');
 await api(B,'poster_put',{revision:rid,data:frame,kind:'frame'});assert.equal((await api(B,'poster_get',{revision:rid})).kind,'frame');
 await api(A,'poster_put',{revision:rid,data:local,kind:'local'}); await api(B,'poster_put',{revision:rid,data:local,kind:'local'});assert.equal((await api(B,'poster_get',{revision:rid})).poster,local);
 assert.equal((await api(B,'poster_put',{revision:rid,data:frame,kind:'frame'})).poster,local);
});
test('cloud posters: optional upload poster is atomic with commit and public consent', async () => {
 const job=await api(B,'reserve',{videos});
 await root("insert into storage.objects(bucket_id,name,metadata) values ('salsa-cloud',$1,$2)",[job.media[0].path,JSON.stringify({size:3,mimetype:'video/mp4'})]);await root('select cloud_finish_media($1,$2)',[job.media[0].id,B]);
 const request={job:job.job,title:'Atomic poster',description:'',tags:[],public_allowed:true,videos:[{id:job.media[0].id,name:'Video'}],poster:{data:'invalid',kind:'local'}};
 await assert.rejects(api(B,'commit',request));assert.equal((await root('select count(*)::int as n from cloud_revisions where figure_id=$1',[job.figure])).rows[0].n,0);
 assert.equal((await api(B,'state')).own_figures.find(f=>f.id===job.figure).public_allowed,false);
 request.poster.data=Buffer.from('ffd8ff01ffd9','hex').toString('base64');const done=await api(B,'commit',request);assert.equal((await api(B,'poster_get',{revision:done.revision})).poster,request.poster.data);
});

test('cloud foreign keys have covering indexes for figure, library, job and revision joins',async()=>{
 const names=['cloud_entries_pending_id_idx','cloud_entries_published_id_idx','cloud_figures_owner_id_idx','cloud_jobs_figure_id_idx','cloud_jobs_owner_id_idx','cloud_libraries_owner_id_idx','cloud_media_figure_id_idx','cloud_media_job_id_idx'];
 const {rows}=await db.query("select indexname from pg_indexes where schemaname='public'");
 for(const name of names)assert.ok(rows.some(r=>r.indexname===name),name+' is missing');
});

test('shared media: trusted hashes merge physical paths without granting access to private figures', async()=>{
 await api(A,'admin_person',{id:C,enabled:true,quota:250000000});
 const first=await uploaded(B),second=await uploaded(C);
 const media1=(await api(B,'state')).own_figures.find(f=>f.id===first.figure).revisions[0].videos[0].id;
 const media2=(await api(C,'state')).own_figures.find(f=>f.id===second.figure).revisions[0].videos[0].id;
 const hash='a'.repeat(64);
 await root('select cloud_verify_content($1,$2)',[media1,hash]);
 assert.equal((await api(C,'duplicates',{hashes:[hash]})).matches.length,0);
 await assert.rejects(api(C,'reserve',{videos:[{...videos[0],reuse:media1}]}));
 await assert.rejects(api(C,'media',{revision:first.revision,media:media1}));
 const result=(await root('select cloud_verify_content($1,$2) result',[media2,hash])).rows[0].result;
 assert.ok(result.discard);
 assert.equal((await root('select count(distinct path)::int n from cloud_media where id in ($1,$2)',[media1,media2])).rows[0].n,1);
 const variant=await api(B,'variant',{revision:first.revision});
 const reused=(await api(B,'state')).own_figures.find(f=>f.id===variant.figure).revisions[0].videos[0].id;
 assert.notEqual(reused,media1);
 assert.equal((await root('select count(distinct path)::int n from cloud_media where id in ($1,$2)',[media1,reused])).rows[0].n,1);
 await api(B,'delete_figure',{figure:first.figure});
 await root("update cloud_figures set deleted_at=now()-interval '31 days' where id=$1",[first.figure]);
 const paths=(await root('select cloud_collect_trash() result')).rows[0].result.paths;
 const survivor=(await api(B,'media',{revision:variant.revision,media:reused})).path;
 assert.ok(!paths.includes(survivor));
 const job=await api(B,'reserve',{figure:variant.figure,videos:[{...videos[0],reuse:reused}]});
 assert.equal(job.media[0].reused,true);
 await root('select cloud_release_job($1)',[job.job]);
 assert.equal((await api(B,'media',{revision:variant.revision,media:reused})).path,survivor);
});
test('only owner and platform admin edit; library management and removed editor grants do not authorize',async()=>{
 const done=await uploaded(B);
 const job=await api(A,'reserve',{figure:done.figure,videos});
 await root('select cloud_release_job($1)',[job.job]);
 await assert.rejects(api(B,'editor',{figure:done.figure,email:'reader@example.test'}));
 await assert.rejects(api(C,'reserve',{figure:done.figure,videos}));
});
test('posters: identical JPEGs in variants have one physical blob',async()=>{
 const done=await uploaded(B);const jpeg=Buffer.from('ffd8ff0304ffd9','hex').toString('base64');
 await api(B,'poster_put',{revision:done.revision,data:jpeg,kind:'local'});
 const variant=await api(B,'variant',{revision:done.revision});
 assert.equal((await api(B,'poster_get',{revision:variant.revision})).poster,jpeg);
 assert.equal((await root("select count(distinct hash)::int blobs,count(*)::int refs from cloud_private.poster_refs where revision_id in ($1,$2)",[done.revision,variant.revision])).rows[0].blobs,1);
});

test('server role can verify and collect without postgres privileges; clients cannot call maintenance RPCs',async()=>{
 const done=await uploaded(B);const mid=(await api(B,'state')).own_figures.find(f=>f.id===done.figure).revisions[0].videos[0].id;
 await role(B);await assert.rejects(db.query('select cloud_verify_content($1,$2)',[mid,'b'.repeat(64)]));await assert.rejects(db.query('select cloud_collect_trash()'));
 await role(null,'service_role');await db.query('select cloud_verify_content($1,$2)',[mid,'b'.repeat(64)]);await db.query('select cloud_collect_trash()');
});
test('updating a figure preserves its ID and stores only one current content row',async()=>{
 const first=await uploaded(B);const old=(await api(B,'state')).own_figures.find(f=>f.id===first.figure).revisions[0].videos[0];
 await root("update cloud_revisions set created_at=now()-interval '100 days' where id=$1",[first.revision]);
 const job=await api(B,'reserve',{figure:first.figure,videos:[{...videos[0],reuse:old.id}]});
 const next=await api(B,'commit',{job:job.job,title:'Aktualisiert',tags:[],videos:[{id:job.media[0].id,name:'Video'}]});
 await root('select cloud_collect_trash()');
 assert.equal((await root('select count(*)::int n from cloud_revisions where id=$1',[first.revision])).rows[0].n,1);
 await root("update cloud_revisions set retired_at=now()-interval '31 days' where id=$1",[first.revision]);
 const garbage=(await root('select cloud_collect_trash() result')).rows[0].result.paths;
 assert.equal(next.revision, first.revision);
 assert.equal((await root('select count(*)::int n from cloud_revisions where figure_id=$1',[first.figure])).rows[0].n,1);
 assert.ok(!garbage.includes((await api(B,'media',{revision:next.revision,media:job.media[0].id})).path));
});
test('server rejects accidental duplicate figures while permitting an explicit independent variant',async()=>{
 const first=await uploaded(B);const old=(await api(B,'state')).own_figures.find(f=>f.id===first.figure).revisions[0].videos[0];
 await root('select cloud_verify_content($1,$2)',[old.id,'c'.repeat(64)]);
 const job=await api(B,'reserve',{videos:[{...videos[0],reuse:old.id}]});
 await assert.rejects(api(B,'commit',{job:job.job,title:'Duplikat',tags:[],videos:[{id:job.media[0].id,name:'Video'}]}),/bereits/);
 await root('select cloud_release_job($1)',[job.job]);
 const explicit=await api(B,'reserve',{variant:true,videos:[{...videos[0],reuse:old.id}]});
 const done=await api(B,'commit',{job:explicit.job,title:'Eigene Variante',tags:[],videos:[{id:explicit.media[0].id,name:'Video'}]});
 assert.notEqual(done.figure,first.figure);
});

test('library order: append, shared order, atomic save, conflict and authorization',async()=>{
 const lib=(await api(B,'library_save',{title:'Ordered',visibility:'public',collaborative:false,moderated:false})).id;
 const first=await uploaded(B,undefined,true),second=await uploaded(B,undefined,true),third=await uploaded(B,undefined,true);
 for(const figure of [first,second,third]) await api(B,'attach',{library:lib,revision:figure.revision});
 let detail=await api(B,'library',{id:lib});
 assert.deepEqual(detail.entries.map(e=>e.figure_id),[first.figure,second.figure,third.figure]);
 const payload={id:lib,title:'Saved order',description:'',visibility:'public',collaborative:false,moderated:false,expected_version:detail.library.edit_version,order:[third.figure,first.figure,second.figure]};
 await assert.rejects(api(C,'library_save',payload),/Berechtigung/);
 await assert.rejects(api(null,'library_save',payload),/Berechtigung/);
 await api(B,'library_save',payload);
 assert.deepEqual((await api(null,'library',{id:lib})).entries.map(e=>e.figure_id),payload.order);
 await assert.rejects(api(A,'library_save',{...payload,title:'Stale'}),/inzwischen geändert/);
 detail=await api(B,'library',{id:lib});assert.equal(detail.library.title,'Saved order');
 await assert.rejects(api(B,'library_save',{...payload,expected_version:detail.library.edit_version,order:[first.figure,first.figure,third.figure]}),/geändert/);
 const next=await uploaded(B,undefined,true);await api(B,'attach',{library:lib,revision:next.revision});
 await assert.rejects(api(B,'library_save',{...payload,expected_version:detail.library.edit_version}),/inzwischen geändert/);
 assert.deepEqual((await api(null,'library',{id:lib})).entries.map(e=>e.figure_id),[...payload.order,next.figure]);
 await api(B,'attach',{library:lib,revision:first.revision});
 assert.deepEqual((await api(null,'library',{id:lib})).entries.map(e=>e.figure_id),[...payload.order,next.figure]);
 await api(B,'public_permission',{figure:second.figure,allowed:false});
 assert.deepEqual((await api(null,'library',{id:lib})).entries.map(e=>e.figure_id),[third.figure,first.figure,next.figure]);
});
test('concurrent owner and admin uploads reject the stale commit and missing client tokens', async()=>{
 const first=await uploaded(B);
 const token=(await api(B,'state')).own_figures.find(f=>f.id===first.figure).content_token;
 const current=(await api(B,'state')).own_figures.find(f=>f.id===first.figure).revisions[0].videos[0];
 await assert.rejects(api(B,'reserve',{figure:first.figure,expected_token:null,videos}));
 const old=await api(A,'reserve',{figure:first.figure,expected_token:token,videos:[{...videos[0],reuse:current.id}]});
 await uploaded(B,first.figure);
 await assert.rejects(api(A,'commit',{job:old.job,title:'Stale',tags:[],videos:[{id:old.media[0].id,name:'v'}]}),/inzwischen/);
 await root("delete from storage.objects where name in (select path from cloud_media where job_id=$1)",[old.job]);
 await root('select cloud_release_job($1)',[old.job]);
 assert.equal((await api(A,'state')).own_figures.find(f=>f.id===first.figure).revisions.length,1);
});
test('admin deletion lists and removes references; a library owner cannot delete another owner figure', async()=>{
 const done=await uploaded(B,null,true);
 const lib=(await api(C,'library_save',{title:'Owned by reader',visibility:'public',collaborative:false,moderated:false})).id;
 await api(A,'attach',{library:lib,revision:done.revision});
 await assert.rejects(api(C,'delete_figure',{figure:done.figure}));
 assert.deepEqual((await api(A,'delete_preview',{figure:done.figure})).libraries,['Owned by reader']);
 await api(A,'delete_figure',{figure:done.figure});
 assert.equal((await api(null,'library',{id:lib})).entries.length,0);
});
