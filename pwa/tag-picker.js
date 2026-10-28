// Exact strings are tag identities. Only searching ignores case.
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.length))];
const sorted = values => unique(values).sort((a,b) => a.localeCompare(b,'de') || (a < b ? -1 : a > b ? 1 : 0));
export function mountTagPicker(input, {value = [], suggestions = [], onChange = () => {}} = {}) {
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const root=make('div','tag-picker'), chips=make('div','tag-picker-chips'), row=make('div','tag-picker-search');
 const panel=make('div','tag-picker-panel'), list=make('div','tag-picker-options'), create=make('button','tag-picker-create');
 const message=make('p','tag-picker-message'), status=make('p','tag-picker-status'), toggle=make('button','tag-picker-toggle','▾');
 let selected=unique(value), available=unique(suggestions), opened=false;
 const refreshButton=make('button','tag-picker-refresh','↻ Tag-Vorschläge aktualisieren');refreshButton.type='button';refreshButton.hidden=true;refreshButton.setAttribute('aria-label','Tag-Vorschläge aktualisieren');
 const events=new AbortController(), listen=(n,type,fn)=>n.addEventListener(type,fn,{signal:events.signal});
 const id=input.id || (input.id='tags-'+crypto.randomUUID());
 input.before(root);root.append(chips,row,panel,status,refreshButton);row.append(input,toggle);panel.append(list,create,message);
 input.value='';input.placeholder='Tags suchen oder neu anlegen';input.autocomplete='off';
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-controls',id+'-options');
 toggle.type=create.type='button';toggle.setAttribute('aria-label','Tag-Auswahl öffnen');
 list.id=id+'-options';list.setAttribute('role','listbox');list.setAttribute('aria-label','Verfügbare Tags');list.setAttribute('aria-multiselectable','true');
 chips.setAttribute('role','group');chips.setAttribute('aria-label','Ausgewählte Tags');status.setAttribute('role','status');message.setAttribute('role','status');
 const change=()=>{onChange([...selected]);input.dispatchEvent(new Event('change',{bubbles:true}));};
 function select(tag){
  if(selected.includes(tag))selected=selected.filter(t=>t!==tag);
  else if(selected.length>=100){message.textContent='Maximal 100 Tags pro Figur.';return;}
  else selected.push(tag);
  message.textContent='';render();change();input.focus({preventScroll:true});
 }
 function render(){
  chips.replaceChildren();
  for(const tag of selected){const b=make('button','tag-picker-chip',tag+' ×');b.type='button';b.setAttribute('aria-label',`Tag „${tag}“ entfernen`);b.onclick=()=>select(tag);chips.append(b);}
  const all=sorted([...available,...selected]), query=input.value.toLocaleLowerCase('de');
  const matches=all.filter(tag=>tag.toLocaleLowerCase('de').includes(query));list.replaceChildren();
  for(const tag of matches){const b=make('button','tag-picker-option',tag);b.type='button';b.setAttribute('role','option');b.setAttribute('aria-label',tag);b.setAttribute('aria-selected',String(selected.includes(tag)));b.onclick=()=>select(tag);list.append(b);}
  const candidate=input.value.trim();create.hidden=!candidate || all.includes(candidate);
  create.textContent=`Neues Tag „${candidate}“ anlegen`;create.disabled=[...candidate].length>160 || selected.length>=100;
  if([...candidate].length>160)message.textContent='Ein Tag darf höchstens 160 Zeichen haben.';
  else if(selected.length>=100)message.textContent='Maximal 100 Tags pro Figur.';
  else message.textContent=!matches.length && !candidate ? 'Noch keine Tags vorhanden.' : '';
  panel.hidden=!opened;input.setAttribute('aria-expanded',String(opened));toggle.setAttribute('aria-expanded',String(opened));
 }
 function open(value=true){opened=value;render();}
 listen(input,'click',()=>open());listen(input,'input',()=>open());
 listen(toggle,'click',()=>{open(!opened);input.focus({preventScroll:true});});
 listen(create,'click',()=>{const tag=input.value.trim();if(!create.disabled && tag){available=unique([...available,tag]);select(tag);input.value='';render();}});
 listen(root,'keydown',event=>{
  if(event.key==='Escape' && opened){event.preventDefault();event.stopPropagation();open(false);input.focus({preventScroll:true});}
  if(['ArrowDown','ArrowUp'].includes(event.key)){
   event.preventDefault();if(!opened)open();
   const options=[...list.children,...(!create.hidden?[create]:[])].filter(b=>!b.disabled);
   const index=options.indexOf(document.activeElement),direction=event.key==='ArrowDown'?1:-1;
   const next=index<0?(direction>0?0:options.length-1):(index+direction+options.length)%options.length;
   options[next]?.focus();
  }
  if(event.key==='Enter' && event.target===input){event.preventDefault();}
 });
 listen(document,'pointerdown',event=>{if(!root.contains(event.target))open(false);});
 listen(root,'focusout',event=>{if(event.relatedTarget && !root.contains(event.relatedTarget))open(false);});
 render();
 return {
  get value(){return [...selected];},
  setValue(values){selected=unique(values);input.value='';opened=false;render();},
  setSuggestions(values){available=unique(values);render();},
  setRefresh(work){refreshButton.onclick=work;refreshButton.hidden=!work;},
  setStatus(text){status.textContent=text;status.hidden=!text;},
  close(){open(false);},
  destroy(){events.abort();root.before(input);root.remove();}
 };
}
