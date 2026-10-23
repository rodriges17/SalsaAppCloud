// Run this interface contract against the PWA and the Android bundle.
export async function mediaContract(page, base) {
 return page.evaluate(async base => {
  const storage = await import(base + 'storage.js');
  const drafts = [1,2].map(i=>({id:crypto.randomUUID(),name:`Video ${i}`,blob:new Blob([`original bytes ${i}`],{type:'video/mp4'}),duration:6,confirmed:true}));
  const figure=await storage.saveFigure({id:crypto.randomUUID(),title:'Medienvertrag',description:'',status:'Neu',tags:[]},drafts);
  const db=await storage.database();
  const change=async(id,work)=>new Promise((resolve,reject)=>{const tx=db.transaction('videos','readwrite'),store=tx.objectStore('videos'),r=store.get(id);r.onsuccess=()=>{const record=r.result;work(record);store.put(record);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  // Empty MIME type is valid cached metadata; it must not trigger a byte read.
  await change(figure.videoIds[1],r=>{r.type='';});
  const original=Cache.prototype.match;let reads=0,fail=false;
  Cache.prototype.match=async function(...args){reads++;if(fail){fail=false;throw Error('Transient read');}return original.apply(this,args);};
  try {
   const records=await storage.figureMedia(figure),info=await Promise.all(records.map(v=>v.describe())),metadataReads=reads;
   const first=records[0].load(),same=records[0].load(),loaded=await Promise.all([first,same]);
   const coalesced=first===same&&loaded[0]===loaded[1]&&reads===1;
   fail=true;let failure;try{await records[1].load();}catch(e){failure=e.message;}
   const retried=await records[1].load(),retryReads=reads;
   await(await storage.figureMedia(figure))[0].load();const freshSessionReads=reads;
   const progress=[];await storage.figureVideos(figure,false,{progress:v=>progress.push(v.done)});
   await change(figure.videoIds[0],r=>{delete r.size;delete r.type;});
   const legacy=(await storage.figureMedia(figure))[0],beforeLegacy=reads,legacyInfo=await legacy.describe();await legacy.load();const legacyReads=reads-beforeLegacy;
   const controller=new AbortController();controller.abort();const beforeAbort=reads;let aborted;
   try{await storage.figureVideos(figure,false,{signal:controller.signal});}catch(e){aborted=e.name;}
   return{metadataReads,sizes:info.map(v=>v.size),types:info.map(v=>v.type),coalesced,failure,retryBytes:await retried.blob.text(),retryReads,freshSessionReads,progress,legacySize:legacyInfo.size,legacyType:legacyInfo.type,legacyReads,aborted,abortedReads:reads-beforeAbort};
  }finally{Cache.prototype.match=original;}
 },base);
}
export const expectedMediaContract={metadataReads:0,sizes:[16,16],types:['video/mp4',''],coalesced:true,failure:'Transient read',retryBytes:'original bytes 2',retryReads:3,freshSessionReads:4,progress:[0,1,2],legacySize:16,legacyType:'video/mp4',legacyReads:1,aborted:'AbortError',abortedReads:0};
