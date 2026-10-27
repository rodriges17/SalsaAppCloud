// One figure upload owns its ordering and completed result. The UI supplies only
// decisions and a progress view; the transport adapter and tests cross this seam.
export function createFigureUpload(services) {
  let phase='idle', active=false, control, identity, input, reserved, outcome, progress=()=>{}, confirm;
  const sameAccount=()=>identity===services.identity();
  const checkAccount=()=>{if(!sameAccount())throw new Error('Das angemeldete Konto wurde inzwischen gewechselt.');};
  const setPhase=(next,message,canCancel=false)=>{phase=next;progress({phase,message,canCancel});};
  const check=()=>{checkAccount();control.signal.throwIfAborted();};
  const result=()=>({...outcome});
  async function cleanup(){if(reserved?.job&&sameAccount())await services.call('abort',{job:reserved.job}).catch(()=>{});}
  async function exclusive(work){if(active)throw new Error('Bitte den aktuellen Upload-Vorgang abwarten.');active=true;try{return await work();}finally{active=false;}}
  async function local(){
    checkAccount();
    try{const linked=await services.remember(input.owner,outcome.saved.revision,input.local,reserved.media.map((m,i)=>({cloud:m.id,local:input.videos[i].id})),outcome.saved.figure,outcome.saved.content);checkAccount();if(linked===false)throw new Error('Die lokale Cloud-Zuordnung konnte nicht gespeichert werden.');outcome.localPending=false;outcome.localError=null;}
    catch(error){if(!sameAccount())throw error;outcome.localPending=true;outcome.localError=error;}
  }
  async function attach(){
    checkAccount();
    try{await services.call('attach',{library:input.library,revision:outcome.saved.revision});checkAccount();outcome.attachPending=false;outcome.attachError=null;}
    catch(error){if(!sameAccount())throw error;outcome.attachPending=true;outcome.attachError=error;}
  }
  async function saved(value){
    // A response is irrevocable success, even when every subsequent step fails.
    outcome={kind:'saved',saved:value,localPending:true,attachPending:!!input.library};
    if(!sameAccount()){outcome.kind='account-changed';return result();}
    setPhase('following-up','Figur gespeichert. Zuordnungen werden aktualisiert …');
    await local();if(input.library)await attach();setPhase('saved','Figur gespeichert.');return result();
  }
  async function reconcile(){
    checkAccount();setPhase('checking','Speicherstand wird geprüft …');
    let status;
    try{status=await services.call('upload_status',{job:reserved.job});checkAccount();}
    catch(error){if(!sameAccount())return {kind:'account-changed'};outcome={kind:'unknown',error};setPhase('unknown','Speicherstand unklar. Bitte Prüfung erneut versuchen.');return result();}
    if(status.status==='saved'&&status.saved?.figure&&status.saved?.revision)return saved(status.saved);
    if(status.status==='not_saved'){
      // This result also fences a delayed commit on the server. Cleanup is now safe.
      await cleanup();outcome={kind:'not-saved'};setPhase('not-saved','Figur wurde nicht gespeichert. Du kannst erneut hochladen.');return result();
    }
    outcome={kind:'unknown'};setPhase('unknown','Speicherstand unklar. Bitte Prüfung erneut versuchen.');return result();
  }
  return {
    get phase(){return phase;},get outcome(){return outcome?result():null;},get currentAccount(){return !identity||sameAccount();},
    get pending(){return ['unknown','checking','committing'].includes(phase)||!!(outcome?.localPending||outcome?.attachPending);},
    cancel(){if(!active||['committing','checking','following-up'].includes(phase))return false;control?.abort();return true;},
    start(value,options={}){return exclusive(async()=>{
      if(outcome?.kind==='unknown')throw new Error('Bitte zuerst den Speicherstand prüfen.');
      if(outcome?.kind==='saved')throw new Error('Die Figur wurde bereits gespeichert. Bitte nur offene Zuordnungen wiederholen.');
      identity=services.identity();input={...value,local:{...value.local,tags:[...(value.local.tags??[])]},videos:value.videos.map(v=>({...v}))};reserved=null;outcome=null;
      control=new AbortController();progress=options.progress??(()=>{});confirm=options.confirm??(async()=>false);
      try{
        if(!input.videos.length)throw new Error('Bitte mindestens ein Video auswählen.');
        if(input.videos.some(v=>v.blob.size>(input.fileLimit??50000000)))throw new Error('Ein Video überschreitet 50 MB. Bitte ein kleineres Originalvideo auswählen.');
        if(input.publicLibrary&&!input.allowed)throw new Error('Für diese öffentliche Bibliothek musst du der öffentlichen Veröffentlichung zustimmen.');
        setPhase('hashing','Videos auf Duplikate prüfen …',true);const hashes=[];
        for(const v of input.videos){check();hashes.push(await services.hash(v.blob));}
        const previous=input.target?.revisions?.[0];
        if(previous)for(const v of previous.videos){check();setPhase('hashing','Cloud-Prüfsummen prüfen und ergänzen …',true);await services.mediaHash({revision:previous.id,media:v.id});}
        check();const {matches}=await services.call('duplicates',{hashes});check();
        if(!input.target&&!input.variant&&matches.length){outcome={kind:'duplicates',matches};setPhase('duplicates','Bestehende Figur auswählen.');return result();}
        if(input.target?.public_allowed&&!input.allowed&&!await confirm({title:'Öffentliche Freigabe widerrufen?',message:'Öffentliche Bibliothekszuordnungen werden entfernt.',ok:'Widerrufen und speichern'})){outcome={kind:'cancelled'};return result();}
        check();const fresh=await services.call('state');check();const target=fresh.own_figures?.find(f=>f.id===input.target?.id);
        if(target&&(input.remoteChanged||target.content_token!==input.target.content_token)&&!await confirm({title:'Cloud-Version überschreiben?',message:'Die Cloud-Version wurde inzwischen geändert. Mit deiner lokalen Version überschreiben?',ok:'Cloud-Version überschreiben'})){outcome={kind:'cancelled'};return result();}
        check();setPhase('reserving','Upload wird vorbereitet …',true);
        reserved=await services.call('reserve',{figure:input.target?.id||null,expected_token:target?.content_token,variant:!!input.variant,videos:input.videos.map((v,i)=>({size:v.blob.size,type:v.blob.type,reuse:matches.find(m=>m.hash===hashes[i])?.media}))});
        check();
        for(let i=0;i<input.videos.length;i++){
          check();setPhase('uploading',`Video ${i+1} von ${input.videos.length} hochladen …`,true);
          if(!reserved.media[i].reused){await services.upload(reserved.media[i].path,input.videos[i].blob,control.signal);check();await services.call('finalize',{id:reserved.media[i].id});}
        }
        check();setPhase('poster','Vorschaubild wird vorbereitet …',true);const poster=await services.poster(input.local.poster).catch(()=>null);check();
        setPhase('committing','Figur wird endgültig gespeichert …');let value;
        try{value=await services.call('commit',{job:reserved.job,...(poster?{poster}:{}),public_allowed:input.allowed,title:input.local.title,description:input.local.description,tags:input.local.tags,videos:reserved.media.map((m,i)=>({id:m.id,name:input.videos[i].name}))});if(!value?.figure||!value?.revision)throw new Error('Speicherbestätigung unvollständig.');}
        catch(error){if(!sameAccount())return {kind:'account-changed'};outcome={kind:'unknown',error};return await reconcile();}
        return await saved(value);
      }catch(error){
        // Never release a job after commit began unless the server fenced it.
        if(!['committing','checking','unknown','following-up','saved'].includes(phase))await cleanup();
        if(!sameAccount()){outcome={kind:'account-changed'};return result();}
        if(control.signal.aborted){outcome={kind:'cancelled'};setPhase('cancelled','Upload abgebrochen.');return result();}
        throw error;
      }
    });},
    reconcile(){return exclusive(reconcile);},
    retryLocal(){return exclusive(async()=>{checkAccount();if(outcome?.kind!=='saved')throw new Error('Kein bestätigter Upload vorhanden.');if(outcome.localPending)await local();return result();});},
    retryAttach(){return exclusive(async()=>{checkAccount();if(outcome?.kind!=='saved')throw new Error('Kein bestätigter Upload vorhanden.');if(outcome.attachPending)await attach();return result();});}
  };
}
