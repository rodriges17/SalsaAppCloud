const tags = values => [...new Set((Array.isArray(values) ? values : []).filter(t=>typeof t==='string' && t.length))];
// A catalog is scoped to one view. It never owns or changes the selected tags.
export function createTagCatalog({identity, local, remote, read, write, revision=()=>0}) {
 let closed=false, generation=0;
 return {
  async load(update=()=>{}) {
   const epoch=++generation,owner=identity(),version=revision(owner);
   const active=()=>!closed && epoch===generation && owner===identity() && version===revision(owner);
   const [localValues,cached]=await Promise.all([local().catch(()=>[]),read(owner).catch(()=>[])]);
   if(!active())return null;
   const emit=(values,complete,loading=false)=>{const value={tags:tags([...localValues,...values]),complete,loading};if(active())update(value);return value;};
   emit(tags(cached),false,true);
   try {
    const result=await remote();
    if(!active())return null;
    if(result?.complete!==true || !Array.isArray(result.tags))throw Error('Unvollständige Tag-Liste.');
    const fresh=tags(result.tags);try { await write(owner,fresh); } catch { /* Persistent suggestions are optional. */ }
    if(!active())return null;
    return emit(fresh,true);
   } catch (error) {
    if(!active())return null;
    if(error.accessChanged || [401,403].includes(error.status)){try { await write(owner,[]); } catch {} return active()?emit([],false):null;}
    return emit(tags(cached),false);
   }
  },
  close(){closed=true;generation++;}
 };
}
