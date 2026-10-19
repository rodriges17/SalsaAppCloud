// Explicit opt-in test against the configured test project. Creates synthetic data only.
// Provide an administrator session via SALSA_QA_SESSION_FILE; never commit sessions.
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CLOUD_URL, CLOUD_KEY } from '../pwa/cloud-config.js';
const sessionFile = process.env.SALSA_QA_SESSION_FILE;
if (!sessionFile) throw new Error('SALSA_QA_SESSION_FILE is required.');
const admin = JSON.parse(await readFile(sessionFile,'utf8')).access_token;
const clip = await readFile('web-tests/fixtures/cloud-qa.mp4');
const email = `salsa-qa-${randomUUID()}@example.invalid`;
const call = async (action,payload={},token=admin) => {
 const r=await fetch(CLOUD_URL+'/functions/v1/cloud',{method:'POST',headers:{apikey:CLOUD_KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(30000)});
 const d=await r.json();if(!r.ok)throw Error(d.error??JSON.stringify(d));return d;
};
let privateId,publicId,figure,job,userToken,passed=false;
try {
 await call('admin_limit',{bytes:900000000});
 await call('admin_user',{email,enabled:false,quota:100000000});
 const link=await call('admin_link',{email}),u=new URL(link.link);
 const auth=await fetch(CLOUD_URL+'/auth/v1/verify',{method:'POST',headers:{apikey:CLOUD_KEY,'Content-Type':'application/json'},body:JSON.stringify({token_hash:u.searchParams.get('token_hash'),type:'magiclink'})});const user=await auth.json();assert.equal(auth.status,200);userToken=user.access_token;
 await assert.rejects(call('reserve',{videos:[{size:clip.length,type:'video/mp4'}]},userToken));
 privateId=(await call('library_save',{title:'QA private – synthetic',description:'Disposable test',visibility:'private',collaborative:true,moderated:true})).id;
 publicId=(await call('library_save',{title:'QA public – synthetic',visibility:'public',collaborative:false,moderated:false})).id;
 await assert.rejects(call('library',{id:privateId},null));
 await assert.rejects(call('member',{library:privateId,email,role:'contributor'}));
 await call('admin_user',{email,enabled:true,quota:100000000});await call('member',{library:privateId,email,role:'contributor'});
 const reserved=await call('reserve',{videos:[{size:clip.length,type:'video/mp4'}]},userToken);job=reserved.job;figure=reserved.figure;
 const upload=await fetch(CLOUD_URL+'/storage/v1/object/salsa-cloud/'+reserved.media[0].path,{method:'POST',headers:{apikey:CLOUD_KEY,Authorization:'Bearer '+userToken,'Content-Type':'video/mp4'},body:clip});assert.equal(upload.status,200,await upload.text());
 await call('finalize',{id:reserved.media[0].id},userToken);
 const version=await call('commit',{job,title:'QA synthetic video',description:'Generated H.264 test',tags:['QA'],videos:[{id:reserved.media[0].id,name:'Synthetic'}]},userToken);job=null;
 await call('attach',{library:privateId,revision:version.revision},userToken);
 const pending=await call('library',{id:privateId});assert.equal(pending.entries[0].pending.id,version.revision);
 await assert.rejects(call('media_url',{revision:version.revision,media:reserved.media[0].id},null));
 await call('review',{library:privateId,figure,accept:true});
 await assert.rejects(call('attach',{library:publicId,revision:version.revision}));
 await call('public_permission',{figure,allowed:true},userToken);await call('attach',{library:publicId,revision:version.revision});
 const signed=await call('media_url',{revision:version.revision,media:reserved.media[0].id},null),download=await fetch(signed.url);assert.equal(download.status,200);
 const bytes=Buffer.from(await download.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(clip).digest('hex'));
 await call('public_permission',{figure,allowed:false},userToken);assert.equal((await call('library',{id:publicId},null)).entries.length,0);
 await call('admin_user',{email,enabled:false,quota:100000000});await assert.rejects(call('reserve',{videos:[{size:1,type:'video/mp4'}]},userToken));
 passed=true;console.log('LIVE OK: manual sign-in, platform approval, private denial, contribution/review, real storage upload, verified size, public consent, signed download byte comparison, revoke and upload suspension.');
} finally {
 if(job)await call('abort',{job},userToken).catch(e=>console.log('Job cleanup requires review:',e.message));
 if(figure)await call('delete_figure',{figure}).catch(e=>console.log('Figure cleanup requires review:',e.message));
 for(const id of[privateId,publicId])if(id)await call('library_delete',{id}).catch(e=>console.log('Library cleanup requires review:',e.message));
 await call('admin_user',{email,enabled:false,quota:0}).catch(()=>{});
 if(userToken)await fetch(CLOUD_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:CLOUD_KEY,Authorization:'Bearer '+userToken}}).catch(()=>{});
 const result={passed,email,privateId,publicId,figure};await writeFile('/tmp/salsa-cloud-live-result.json',JSON.stringify(result));console.log('Synthetic test data cleaned; test account disabled:',email);
}
