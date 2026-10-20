import { inspectLocalBackup, exportLocalBackup, storageSettings, planBackupRestore, restoreBackupPlan } from './storage.js';
import { readBackup, partLayout } from './backup-format.js';
const scope=new URL('./',import.meta.url).pathname,LAST=`salsa-last-backup:${scope}:v1`;
const n=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const size=bytes=>`${(bytes/1048576).toFixed(1)} MiB`;
let dialog,body,status,cancel,close,busy=false,controller,urls=[],hooks;
const action=(label,work)=>{const b=n('button',label,'secondary');b.type='button';b.onclick=()=>Promise.resolve().then(work).catch(error=>{status.textContent=error.message;});return b;};
function release(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
function date(value){return new Date(value).toLocaleString('de');}
function lastCreated(){try{const data=JSON.parse(localStorage.getItem(LAST));return data?.createdAt?`Zuletzt erstellt am ${date(data.createdAt)} · ${data.parts} Teil(e). Das bestätigt die Erstellung, nicht das Speichern der Downloads.`:'Noch kein vollständiges Backup erstellt.';}catch{return 'Noch kein vollständiges Backup erstellt.';}}
function progress(p){if(p.phase==='commit'){cancel.disabled=true;status.textContent='Wiederherstellung abschließen …';}else if(p.phase==='scan')status.textContent=`Lokalen Bestand prüfen: ${p.done} / ${p.total} Figuren …`;else if(p.phase==='compare')status.textContent=`Vorhandene Figuren vergleichen: ${p.done} / ${p.total} …`;else if(p.total)status.textContent=`${p.phase==='verify'?'Sicherung prüfen':'Sicherung erstellen'}: ${size(p.done)} / ${size(p.total)} …`;else status.textContent='Videos kopieren und prüfen …';}
async function run(work){if(busy)return;busy=true;controller=new AbortController();cancel.hidden=false;cancel.disabled=false;close.disabled=true;body.inert=true;status.textContent='Bitte warten …';try{return await work({signal:controller.signal,progress});}catch(e){status.textContent=e.name==='AbortError'?'Abgebrochen. Der bisherige Bestand wurde nicht verändert.':e.message;}finally{busy=false;controller=null;cancel.hidden=true;close.disabled=false;body.inert=false;}}
function open(title){if(busy)return false;release();body.replaceChildren();status.textContent='';document.getElementById('backupTitle').textContent=title;if(!dialog.open)dialog.showModal();return true;}
function summary(sources){const videos=sources.flatMap(s=>s.records),bytes=videos.reduce((n,v)=>n+v.blob.size,0);return {figures:sources.length,videos:videos.length,bytes};}
async function createView(){if(!open('Vollständiges Backup erstellen'))return;body.append(n('p','Sichert alle lokalen Figuren aus App-Speicher und verbundenen Geräteordnern, einschließlich Videos, Angaben und Lernständen. Cloud-Inhalte werden nur gesichert, wenn sie lokal übernommen wurden. Anmeldedaten und Ordnerberechtigungen sind nicht enthalten.'));
 const inventory=await run(options=>inspectLocalBackup(options));if(!inventory){body.append(action('Bestand erneut prüfen',createView));return;}
 const info=summary(inventory.sources),sizes=[];for(const s of inventory.sources){if(s.figure.poster?.size)sizes.push(s.figure.poster.size);for(const v of s.records){sizes.push(v.blob.size);if(v.poster?.size)sizes.push(v.poster.size);}}
 const parts=partLayout(sizes).count;body.append(n('p',`${info.figures} Figuren · ${info.videos} Videos · ${size(info.bytes)} Videodaten · ${parts} Sicherungsteil(e), jeweils höchstens 250 MiB.`),n('p','Die Sicherung ist nicht verschlüsselt. Bewahre alle Teile gemeinsam auf. Für eine vollständige Wiederherstellung werden alle Teile benötigt.'));
 body.append(action('Backup jetzt erstellen',async()=>{
   const result=await run(options=>exportLocalBackup(inventory.snapshot,options));if(!result)return;
   release();body.replaceChildren(n('p',`${result.manifest.figures.length} Figuren wurden vollständig in ${result.parts.length} Teil(e) verpackt. Lade jeden Teil herunter und bewahre die Dateien gemeinsam auf.`));
   for(let i=0;i<result.parts.length;i++){
     const part=result.parts[i],url=URL.createObjectURL(part.blob);urls.push(url);const box=n('section',undefined,'cloud-card');box.append(n('p',part.name),n('p',size(part.blob.size)));
     const label=n('p','Noch nicht zum Download angefordert.');
     const download=n('a',`Teil ${i+1} von ${result.parts.length} herunterladen`,'secondary backup-download');download.href=url;download.download=part.name;download.onclick=()=>{label.textContent='Download angefordert. Bitte im Browser prüfen, ob die Datei gespeichert wurde.';};box.append(download,label);body.append(box);
   }
   try{localStorage.setItem(LAST,JSON.stringify({createdAt:result.manifest.createdAt,parts:result.parts.length}));}catch{/* Download remains available without bookkeeping. */}
   status.textContent='Backup erstellt. Die Dateien sind zum Herunterladen bereit.';updateLast();
 }));status.textContent='Bestand vollständig geprüft.';
}
function updateLast(){const e=document.getElementById('backupLastCreated');if(e)e.textContent=lastCreated();}
async function restoreView(){if(!open('Vollständiges Backup wiederherstellen'))return;
 body.append(n('p','Wähle alle zusammengehörigen .salsabackup-Dateien aus. Die App prüft zunächst alle Teile. Bestehende Figuren bleiben bis zur bestätigten Übernahme unverändert. Für Figur-ZIP-Dateien verwende „Figur importieren“.'));
 const label=n('label','Alle Sicherungsteile auswählen'),input=n('input');input.type='file';input.multiple=true;input.accept='.salsabackup,application/octet-stream';label.append(input);body.append(label);
 const details=n('div');body.append(details);
 const selectFiles=async()=>{
   const files=[...input.files];if(!files.length)return;details.replaceChildren();
   const archive=await run(options=>readBackup(files,options));if(!archive)return;
   const info=summary(archive.sources);details.append(n('p',`Sicherung vom ${date(archive.manifest.createdAt)}: ${info.figures} Figuren · ${info.videos} Videos · ${size(info.bytes)} · alle ${archive.manifest.partCount} Teile geprüft.`));
   const settings=await storageSettings(),wrap=n('label','Ziel für die Wiederherstellung'),target=n('select');target.setAttribute('aria-label','Ziel für die Wiederherstellung');target.append(new Option('App-Speicher',''));
   if(settings.supported)for(const f of settings.folders)target.append(new Option(`Geräteordner: ${f.name}`,f.id));wrap.append(target);details.append(wrap);
   details.append(n('p','Konflikte werden mit Figuren am ausgewählten Zielspeicher verglichen. Figuren an anderen Speicherorten bleiben erhalten.'));
   if(!settings.supported)details.append(n('p','Dieser Browser unterstützt keine Geräteordner. Die Wiederherstellung verwendet den App-Speicher.'));
   else if(!settings.folders.length)details.append(n('p','Für einen Geräteordner richte zuerst unter Speicherort einen Ordner ein. Du kannst dieses Fenster schließen und danach die Sicherung erneut auswählen.'));
   const conflicts=n('div');details.append(action('Wiederherstellung prüfen',async()=>{
     conflicts.replaceChildren();const plan=await run(options=>planBackupRestore(archive,target.value||null,options));if(!plan)return;
     const selections=[];let identical=0,newCount=0,conflictCount=0;
     for(const row of plan.rows){const box=n('section',undefined,'cloud-card'),select=n('select');box.append(n('h3',row.source.figure.title),n('p',`Lernstand: ${row.source.figure.status} · ${row.source.records.length} Video(s)`));select.setAttribute('aria-label',`Wiederherstellung für ${row.source.figure.title}`);
       if(row.kind==='new'){newCount++;select.append(new Option('Als neue Figur wiederherstellen','add'),new Option('Überspringen','keep'));}
       else{row.kind==='identical'?identical++:conflictCount++;select.append(new Option(row.kind==='identical'?'Identische Figur überspringen':'Vorhandene behalten','keep'),new Option('Zusätzliche Kopie wiederherstellen','copy'));for(const f of row.candidates)select.append(new Option(`Ersetzen: ${f.title} · ${f.status}`,`replace:${f.id}`));}
       select.value=row.choice;selections.push(select);box.append(select);conflicts.append(box);
     }
     conflicts.prepend(n('p',`${newCount} neue Figuren · ${identical} identische Figuren · ${conflictCount} Konflikte. Standard bei vorhandenen Figuren: behalten.`));
     const apply=action('Auswahl wiederherstellen',async()=>{
       if((target.value||null)!==plan.targetFolder){status.textContent='Ziel wurde geändert. Bitte erneut prüfen.';return;}
       const choices=selections.map(s=>s.value),replaces=choices.filter(c=>c.startsWith('replace:')).length;
       if(!await hooks.confirm({title:'Backup wiederherstellen?',message:`${choices.filter(c=>c!=='keep').length} Figuren übernehmen, davon ${replaces} vorhandene Figuren ausdrücklich ersetzen? Andere Figuren bleiben erhalten.`,ok:'Wiederherstellen'}))return;
       const count=await run(options=>restoreBackupPlan(plan,choices,options));if(count===undefined)return;
       body.replaceChildren(n('p',`${count} Figuren erfolgreich wiederhergestellt. Lernstände und Erstellungsdaten wurden übernommen.`));status.textContent='Wiederherstellung abgeschlossen.';hooks.changed();await hooks.refresh();
     });conflicts.append(apply);status.textContent='Bitte die Auswahl prüfen und bestätigen.';
   }),conflicts);
   target.onchange=()=>{conflicts.replaceChildren();status.textContent='Ziel geändert. Bitte Wiederherstellung erneut prüfen.';};status.textContent='Alle Sicherungsdateien sind gültig.';
 };
 input.onchange=()=>selectFiles().catch(e=>{status.textContent=e.message;});
}
export function initBackup(callbacks){hooks=callbacks;dialog=document.getElementById('backupDialog');body=document.getElementById('backupBody');status=document.getElementById('backupStatus');cancel=document.getElementById('backupCancel');close=document.getElementById('backupClose');cancel.onclick=()=>{controller?.abort();cancel.disabled=true;status.textContent='Abbruch angefordert …';};close.onclick=()=>{if(!busy){dialog.close();const old=urls;urls=[];setTimeout(()=>old.forEach(u=>URL.revokeObjectURL(u)),30000);}};dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)close.onclick();});document.getElementById('createBackup').onclick=()=>createView().catch(e=>{status.textContent=e.message;});document.getElementById('restoreBackup').onclick=()=>restoreView().catch(e=>{status.textContent=e.message;});document.getElementById('infoButton').addEventListener('click',updateLast);window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});updateLast();}
