// A view owns the lifetime of its cards and preview requests. Downloads keep
// their independent workflow; closing a card never cancels a saved/import run.
export function createCloudCards(){
 const entries=new Set(),requests=new Map();
 function clear(root){
  for(const box of requests.keys())if(root===box||root.contains(box))requests.delete(box);
  root.querySelectorAll('video').forEach(player=>{player.pause();player.removeAttribute('src');player.load();player.remove();});
 }
 function register({card,content,group,build,opened=()=>{},closed=()=>{}}){
  let mounted=false,wasOpen=false;
  const close=()=>{card.open=false;clear(content);if(wasOpen){wasOpen=false;closed();}};
  // Native toggle events may be coalesced when a card closes and reopens.
  // Observe removal of open as well, so requests from before that close expire.
  const changed=records=>{if(records.some(record=>record.oldValue!==null))clear(content);};
  const observer=new document.defaultView.MutationObserver(changed);
  observer.observe(card,{attributes:true,attributeFilter:['open'],attributeOldValue:true});
  const entry={card,content,group,close,flush:()=>changed(observer.takeRecords()),disconnect:()=>observer.disconnect()};entries.add(entry);
  const sync=()=>{
   if(!entries.has(entry)||!card.isConnected)return;
   if(!card.open){close();return;}
   for(const other of entries)if(other!==entry&&other.group===group&&other.card.open)other.close();
   if(!mounted){build();mounted=true;}
   if(!wasOpen){wasOpen=true;opened();}
  };
  card.ontoggle=sync;
  return {open(){card.open=true;sync();},close};
 }
 return {register,clear,
  dispose(root){clear(root);for(const entry of entries)if(root===entry.card||root.contains(entry.card)){entry.card.ontoggle=null;entry.disconnect();entries.delete(entry);}},
  async preview(box,read){
   const entry=[...entries].find(entry=>entry.card.contains(box));
   entry?.flush();
   clear(entry?.content??box);
   const request={};requests.set(box,request);
   const active=()=>requests.get(box)===request&&box.isConnected&&!box.closest('[hidden]')&&box.closest('details')?.open!==false;
   try{
    const signed=await read();if(!active())return;
    const player=document.createElement('video');player.controls=true;player.playsInline=true;player.src=signed.url;box.append(player);
   }catch(error){if(active())throw error;}
  }
 };
}
