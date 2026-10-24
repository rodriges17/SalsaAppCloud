// PROTOTYPE: Three storage settings layouts on the existing settings screen.
// Question: How can connected folder, permission and default destination be unmistakable?
// Run: npm run prototype:storage; open /pwa/?prototype=storage&variant=A
let state={connected:true,granted:true,active:'folder',name:'Documents',count:2};
const names={A:'Status direkt am Button',B:'Speicherort auswählen',C:'Einrichtung in drei Schritten'};
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
let host,activeText;
function action(text,fn,done=false){const b=node('button',text,done?'proto-done':'secondary');b.type='button';b.disabled=done;b.onclick=()=>{fn();paint();};return b;}
const folderChoice=()=>{state.connected=true;state.granted=true;state.name=state.name==='Documents'?'Training':'Documents';state.active='folder';};
const useFolder=()=>{state.granted=true;state.active='folder';};
const card=()=>node('div',null,'cloud-card');
function VariantA(){
 const wrap=document.createDocumentFragment();
 wrap.append(action(state.active==='app'?'✓ App-Speicher für neue Figuren aktiv':'App-Speicher verwenden',()=>state.active='app',state.active==='app'));
 wrap.append(action(state.connected?'✓ Geräteordner verbunden · Anderen auswählen':'Geräteordner auswählen',folderChoice));
 if(state.connected){const c=card();c.append(node('strong',`${state.name} · ${state.count} Figuren`));
 c.append(action(state.granted?'✓ Ordnerzugriff erlaubt':'Ordnerzugriff erlauben',()=>state.granted=true,state.granted));
 c.append(action(state.active==='folder'?'✓ Für neue Figuren aktiv':'Für neue Figuren verwenden',useFolder,state.active==='folder'));wrap.append(c);}
 return wrap;
}
function VariantB(){
 const wrap=document.createDocumentFragment();const c=card();
 c.append(node('strong','Neue Figuren speichern in …'));
 for(const [key,title,sub]of [['app','App-Speicher','Privat innerhalb dieser App'],['folder',state.connected?state.name:'Geräteordner','Videos in deinem Geräteordner']]){
 const b=action(`${state.active===key?'◉':'○'} ${title}`,()=>{if(key==='folder'&&!state.connected)folderChoice();else state.active=key;});b.setAttribute('aria-pressed',String(state.active===key));b.append(node('small',sub));c.append(b);
 }
 if(state.connected){c.append(node('p',state.granted?`✓ ${state.name} verbunden · Zugriff erlaubt`:`${state.name} verbunden · Zugriff erforderlich`,state.granted?'proto-good':'muted'));if(!state.granted)c.append(action('Zugriff erlauben',()=>state.granted=true));}
 c.append(action(state.connected?'Anderen Geräteordner auswählen':'Geräteordner verbinden',folderChoice));wrap.append(c);return wrap;
}
function VariantC(){
 const wrap=document.createDocumentFragment();wrap.append(node('h3',`Neue Figuren → ${state.active==='folder'?state.name:'App-Speicher'}`));
 const rows=[['1','Geräteordner',state.connected?`${state.name} verbunden`:'Noch nicht ausgewählt',state.connected,'Ordner auswählen',folderChoice],['2','Zugriffsrecht',state.granted?'Zugriff erlaubt':'Zugriff erforderlich',state.granted,'Zugriff erlauben',()=>state.granted=true],['3','Neue Figuren',state.active==='folder'?'Geräteordner ist aktiv':'App-Speicher ist aktiv',state.active==='folder','Geräteordner verwenden',useFolder]];
 for(const [num,title,detail,done,label,fn]of rows){const row=node('div',null,'proto-step');row.append(node('span',done?'✓':num,'proto-number'),node('strong',title),node('p',detail));if(!done)row.append(action(label,fn));wrap.append(row);}
 wrap.append(action('Auf App-Speicher wechseln',()=>state.active='app'));return wrap;
}
function variant(){const key=new URL(location.href).searchParams.get('variant');return key in names?key:'A';}
function paint(){
 activeText.textContent=`Neue Figuren: ${state.active==='folder'?`Geräteordner „${state.name}“`:'App-Speicher'}. Vorhandene Figuren bleiben an ihrem bisherigen Speicherort.`;
 host.replaceChildren(({A:VariantA,B:VariantB,C:VariantC})[variant()]());
 document.querySelector('#protoVariant').textContent=`${variant()} · ${names[variant()]}`;
 document.querySelector('#protoState').textContent=`Ordner: ${state.connected?state.name:'keiner'} · Zugriff: ${state.granted?'erlaubt':'nicht erlaubt'} · Neue Figuren: ${state.active==='folder'?'Geräteordner':'App-Speicher'}`;
}
function cycle(direction){const keys=Object.keys(names),key=keys[(keys.indexOf(variant())+direction+keys.length)%keys.length],url=new URL(location.href);url.searchParams.set('variant',key);history.replaceState(null,'',url);paint();}
export function renderStoragePrototype(controls,summary){
 host=controls;activeText=summary;
 if(!document.querySelector('#protoBar')){
 const css=document.createElement('link');css.rel='stylesheet';css.href='./storage-prototype.css';document.head.append(css);
 const bar=node('aside');bar.id='protoBar';bar.setAttribute('aria-label','Prototyp-Varianten');
 bar.append(node('strong','PROTOTYP · Nur Beispieldaten, keine Speicherung'));
 const nav=node('nav'),label=node('span');label.id='protoVariant';nav.append(action('←',()=>cycle(-1)),label,action('→',()=>cycle(1)));bar.append(nav);
 const scenarios=node('select');scenarios.setAttribute('aria-label','Beispielzustand');
 for(const [value,title]of [['folder','Ordner aktiv · Zugriff erlaubt'],['app','App-Speicher aktiv'],['denied','Ordner aktiv · Zugriff fehlt'],['empty','Noch kein Ordner']]){const o=node('option',title);o.value=value;scenarios.append(o);}
 scenarios.onchange=()=>{const v=scenarios.value;state={...state,connected:v!=='empty',granted:v!=='denied'&&v!=='empty',active:v==='app'||v==='empty'?'app':'folder'};paint();};bar.append(scenarios);
 const status=node('p');status.id='protoState';status.setAttribute('role','status');bar.append(status);document.querySelector('#infoDialog').append(bar);
 window.addEventListener('keydown',event=>{if(event.target.closest('input,textarea,select,[contenteditable=true]'))return;if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();cycle(event.key==='ArrowLeft'?-1:1);}});
 }
 paint();
}
