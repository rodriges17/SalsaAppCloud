import { createTagCatalog } from './tag-catalog.js';
import { cloudCall, cloudIdentity } from './cloud-api.js';
import { readCloudCache, writeCloudCache, cloudCacheRevision } from './cloud-cache.js';
import { listLocalTags } from './storage.js';

export function connectTagSuggestions(picker, initial=[]) {
 let localTags=initial;
 const events=new AbortController();
 const catalog=createTagCatalog({
  identity:cloudIdentity, revision:cloudCacheRevision,
  local:async()=>{try { localTags=await listLocalTags(); } catch {} return localTags;},
  remote:()=>cloudCall('tags'),
  read:async owner=>(await readCloudCache(owner,'tags'))?.value?.tags ?? [],
  write:(owner,tags)=>writeCloudCache(owner,'tags',{tags})
 });
 const refresh=()=>{
  // Clear previous-account/revoked suggestions synchronously; selections live
  // in the picker independently and are never changed by catalog updates.
  picker.setSuggestions(localTags);
  picker.setStatus('Cloud-Tags werden geladen …');
  void catalog.load(value=>{
   picker.setSuggestions(value.tags);
   picker.setStatus(value.loading ? 'Cloud-Tags werden geladen …' : value.complete ? 'Cloud-Tags aktuell.' : 'Cloud-Liste möglicherweise unvollständig. Lokal bekannte und zuletzt geladene Tags bleiben verfügbar.');
  });
 };
 for(const event of ['cloud-session-changed','online','local-figures-changed'])globalThis.addEventListener(event,refresh,{signal:events.signal});
 globalThis.addEventListener('cloud-cache-cleared',event=>{if(event.detail.owner===cloudIdentity())refresh();},{signal:events.signal});
 picker.setRefresh(refresh);refresh();
 return ()=>{events.abort();catalog.close();picker.setRefresh(null);};
}
