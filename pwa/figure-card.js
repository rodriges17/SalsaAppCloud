import {timeLabel} from './logic.js';
import {cloudIcon,provenanceIcon,provenanceLabel} from './cloud-provenance.js';

const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export const tagIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 8 0 10 10-8 8L3 11V3Z"/><circle cx="7" cy="7" r="1"/></svg>';
function figureTitle(title,local=false){return node(local?'span':'h3',title,local?'card-title':undefined);}
function figurePicture(local=false,url){
 const picture=node(local&&url?'img':'span',local&&!url?'▷':undefined,local?`card-thumb${url?'':' thumb-placeholder'}`:'cloud-library-picture');
 if(local&&url){picture.src=url;picture.alt='';}else if(local)picture.setAttribute('aria-hidden','true');
 return picture;
}
export function figureTags(tags=[],{local=false}={}){
 if(local){
  const row=node('span',undefined,'card-tags');row.dataset.total=tags.length;row.title=tags.join(' · ');
  row.setAttribute('role','group');row.setAttribute('aria-label',`Tags: ${tags.join(', ')}`);
  for(const tag of tags.slice(0,3)){const chip=node('span',undefined,'card-tag-chip');chip.setAttribute('aria-hidden','true');chip.innerHTML=tagIcon;chip.append(node('span',tag,'card-tag-text'));row.append(chip);}
  const more=node('span','…','card-tags-more');more.setAttribute('aria-hidden','true');row.append(more);return row;
 }
 const list=node('ul',undefined,'cloud-tag-pills');list.setAttribute('aria-label','Tags');list.setAttribute('role','list');
 for(const tag of tags){const item=node('li',undefined,'cloud-tag-pill');item.innerHTML=tagIcon;item.append(node('span',tag));list.append(item);}
 return list;
}
export function setCloudStatusLabel(target,text,modified=false){
 const icon=node('span',undefined,'cloud-status-icon');icon.innerHTML=cloudIcon(modified);target.replaceChildren(icon,node('span',text));
}
export function appendFigureDescription(parent,description){
 if(description)parent.append(node('p',description,'cloud-figure-description'));
}
export function createCloudFigureCard({kind,id,title,tags=[],subtitle,position}){
 tags=tags??[];
 const prefix=kind==='own'?'cloud-own':'cloud-library';
 const card=node('details',undefined,`${prefix}-figure cloud-figure-card`);
 card.dataset[kind==='own'?'ownFigure':'libraryFigure']=id;
 const summary=node('summary',undefined,`${prefix}-summary cloud-figure-summary`);
 if(position!==undefined)summary.append(node('span',String(position),'cloud-order-number'));
 const picture=figurePicture();summary.append(picture);
 const name=node('div',undefined,`${prefix}-name cloud-figure-name`);name.append(figureTitle(title));
 if(subtitle!==undefined)name.append(node('small',subtitle));
 if(tags.length){const pills=figureTags(tags);pills.title=tags.join(', ');name.append(pills);}
 const availability=node('span',undefined,`${prefix}-availability cloud-figure-availability`);
 summary.append(name,availability);
 const content=node('div',undefined,`${prefix}-content`);card.append(summary,content);
 return {card,summary,picture,content,setAvailability(local){
  setCloudStatusLabel(availability,local.label,local.modified);
  availability.dataset.local=String(local.available);availability.title=local.detail??local.label;
 }};
}

function fitTags(row){
 const chips=[...row.querySelectorAll('.card-tag-chip')],more=row.querySelector('.card-tags-more');
 chips.forEach(chip=>chip.hidden=false);more.hidden=false;
 const gap=parseFloat(row.ownerDocument.defaultView.getComputedStyle(row).columnGap)||0,available=row.clientWidth;
 let used=0,count=0;
 for(const chip of chips){const width=chip.getBoundingClientRect().width,reserve=count<Number(row.dataset.total)-1?more.getBoundingClientRect().width+gap:0;if(used+width+reserve>available+0.5)break;used+=width+gap;count++;}
 chips.forEach((chip,index)=>chip.hidden=index>=count);more.hidden=count===Number(row.dataset.total);
}
// Local geometry stays in its existing CSS. This view owns only metadata,
// object URLs and tag fitting; it never opens the figure's videos.
export function createLocalCardsView({open,status,notify}){
 const observer=new document.defaultView.ResizeObserver(entries=>entries.forEach(({target})=>fitTags(target)));
 let urls=[];
 document.fonts?.ready.then(()=>document.querySelectorAll('.card-tags').forEach(fitTags));
 const button=(label,work,cls)=>{const b=node('button',label,cls);b.type='button';b.onclick=work;return b;};
 return {reset(){observer.disconnect();urls.forEach(url=>URL.revokeObjectURL(url));urls=[];},card(figure){
  const card=node('article',undefined,'figure-card');card.dataset.figureId=figure.id;
  const main=button('',()=>open(figure),'card-main');main.setAttribute('aria-label',`${figure.title} lernen`);
  let url;if(figure.poster){url=URL.createObjectURL(figure.poster);urls.push(url);}
  const thumbnailButton=button('',()=>open(figure),'card-thumbnail-button');thumbnailButton.setAttribute('aria-label',`Vorschaubild von ${figure.title} abspielen`);thumbnailButton.append(figurePicture(true,url));
  const copy=node('span',undefined,'card-copy');copy.append(figureTitle(figure.title,true));
  const metadata=node('span',`${timeLabel(figure.duration)} · ${figure.videoIds.length} Video${figure.videoIds.length===1?'':'s'}`,'card-meta');metadata.title=metadata.textContent;
  const learningLine=node('span',undefined,'card-learning-line');learningLine.append(metadata);copy.append(learningLine);
  if(figure.tags.length){const tags=figureTags(figure.tags,{local:true});copy.append(tags);observer.observe(tags);}
  main.append(copy);
  const storage=node('div',undefined,'card-storage-status');
  const folderIcon=node('span',undefined,'card-folder-icon');folderIcon.setAttribute('aria-hidden','true');folderIcon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/></svg>';
  const folderName=figure.storageFolder?figure.folderName||'SalsaTrainer':'App-Speicher',folder=node('span',folderName,'card-storage-folder');folder.title=folderName;
  const learning=node('span',figure.status,'card-status status-'+(figure.status==='Sitzt'?'learned':figure.status==='Am Üben'?'practice':'new'));learning.title=`Lernstand: ${figure.status}`;
  const cloudStatus=status(figure),label=provenanceLabel(cloudStatus),badge=button('',()=>notify(label),'card-provenance');badge.innerHTML=provenanceIcon(cloudStatus);badge.title=label;badge.setAttribute('aria-label',label);badge.dataset.cloudStatus=cloudStatus;
  storage.append(folderIcon,folder,learning,badge);
  const details=node('div',undefined,'card-details');details.append(main,storage);card.append(thumbnailButton,details);
  return {card,main,thumbnailButton};
 }};
}
