import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createPeopleView} from '../pwa/cloud-people.js';

function fixture({ failMember = false, beforeCall = async () => {}, confirmation } = {}) {
 const window=new Window(),document=window.document;
 const state={me:{id:'self',is_admin:true},people:[{id:'writer',name:'Anna',email:'writer@test.ch',upload_enabled:true,quota:250000000,used:0},{id:'self',email:'admin@test.ch',is_admin:true,upload_enabled:true,quota:500000000,used:0},{id:'reader',email:'reader@test.ch',upload_enabled:false,quota:0,used:0}],libraries:[{id:'lib',title:'Kurs',manage:true,collaborative:true}],settings:{used:0,total_limit:900000000}};
 const calls=[],prompts=[];let answer=false,view;
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const action=(label,work)=>{const b=node('button',label);b.type='button';b.onclick=work;return b;};
 const field=(form,label,value='',type='text')=>{const l=node('label',label),i=node('input');i.type=type;i.value=String(value);l.append(i);form.append(l);return i;};
 const checkbox=(form,label,checked)=>{const i=field(form,label,'','checkbox');i.checked=checked;return i;};
 const select=(form,label,options,value)=>{const l=node('label',label),s=node('select');for(const[v,t]of options){const o=node('option',t);o.value=v;s.append(o)}if(value!==undefined)s.value=value;l.append(s);form.append(l);return s;};
 const host=node('section');document.body.append(host);
 view=createPeopleView({node,action,field,select,checkbox,state:()=>state,confirm:async opts=>{prompts.push(opts);return confirmation ? confirmation(opts) : answer;},run:async(message,work)=>work(),call:async(a,p)=>{calls.push({action:a,payload:p});await beforeCall(a,p);if(a==='admin_access')return {memberships:[]};if(a==='member' && failMember){failMember=false;throw new Error('Zuweisung fehlgeschlagen');}if(a==='admin_user'){let u=state.people.find(x=>x.email===p.email);if(!u){u={id:p.email,email:p.email,used:0};state.people.push(u);}u.quota=p.quota;u.upload_enabled=p.enabled;}return {};},refresh:async()=>view.mount(host),report:e=>{throw e;},account:()=>{},extraManagement:()=>action('Videos prüfen',()=>{})});
 view.mount(host);
 const button=(name,scope=host)=>[...scope.querySelectorAll('button')].find(b=>b.textContent===name);
 const click=async b=>{assert.ok(b,'control exists');await b.onclick();await Promise.resolve();};
 const person=email=>[...host.querySelectorAll('.cloud-person-summary')].find(b=>b.textContent.includes(email));
 const input=label=>[...host.querySelectorAll('label')].find(l=>l.firstChild.textContent===label)?.querySelector('input,select');
 return {window,host,view,state,calls,prompts,button,click,person,input,setAnswer:v=>answer=v};
}

test('guided users expose one panel and preserve unsaved edits when leaving is cancelled',async()=>{
 const f=fixture();await f.click(f.person('writer@test.ch'));
 assert.deepEqual([...f.host.querySelectorAll('[role=tabpanel]')].filter(p=>!p.hidden).map(p=>p.id),['person-writer-Konto']);
 await f.click(f.button('Berechtigungen'));const quota=f.input('Speicherlimit in MB');quota.value='300';quota.oninput();
 assert.equal(f.view.dirty,true);await f.click(f.person('reader@test.ch'));
 assert.equal(f.person('writer@test.ch').getAttribute('aria-expanded'),'true');assert.equal(quota.value,'300');assert.equal(f.prompts[0].cancel,'Weiter bearbeiten');
 f.setAnswer(true);await f.click(f.person('reader@test.ch'));assert.equal(f.view.dirty,false);assert.equal(f.host.querySelectorAll('.cloud-person-details').length,1);
 await f.window.happyDOM.close();
});

test('user can save cloud quota and library access together and see the saved state',async()=>{
 const f=fixture();await f.click(f.person('writer@test.ch'));await f.click(f.button('Berechtigungen'));
 const quota=f.input('Speicherlimit in MB');quota.value='300';quota.oninput();
 const role=f.input('Rolle in Kurs');role.value='reader';role.onchange();
 await f.click(f.button('Änderungen speichern'));
 assert.equal(f.state.people[0].quota,300000000);
 assert.deepEqual(f.calls.filter(c=>c.action==='member'),[{action:'member',payload:{library:'lib',email:'writer@test.ch',role:'reader'}}]);
 assert.equal(f.view.dirty,false);assert.match(f.host.textContent,/Änderungen gespeichert/);
 await f.window.happyDOM.close();
});

test('search and filters show matching users and further management survives tab switches',async()=>{
 const f=fixture();assert.match(f.person('admin@test.ch').textContent,/Du/);
 await f.click(f.button('Gesperrt'));assert.equal(f.host.querySelectorAll('.cloud-person-summary').length,1);assert.match(f.host.textContent,/Konto bleibt zum Lesen/);
 await f.click(f.button('Alle'));const search=f.input('Benutzer suchen');search.value='Anna';search.oninput();assert.equal(f.host.querySelectorAll('.cloud-person-summary').length,1);
 await f.click(f.person('writer@test.ch'));await f.click(f.button('Aktionen'));assert.ok(f.button('Neuen Anmeldelink erstellen'));assert.ok(f.button('Videos prüfen'));assert.equal(f.host.querySelector('.cloud-platform-limits').open,false);
 await f.window.happyDOM.close();
});


test('retry after a library failure preserves the saved account and writes only the outstanding access',async()=>{
 const f=fixture({failMember:true});await f.click(f.person('writer@test.ch'));await f.click(f.button('Berechtigungen'));
 const quota=f.input('Speicherlimit in MB');quota.value='300';quota.oninput();
 const role=f.input('Rolle in Kurs');role.value='reader';role.onchange();
 await assert.rejects(f.click(f.button('Änderungen speichern')),/Zuweisung fehlgeschlagen/);
 assert.equal(f.view.dirty,true);
 await f.click(f.button('Änderungen speichern'));
 assert.equal(f.calls.filter(c=>c.action==='admin_user').length,1,'saved account must not be written again');
 assert.equal(f.calls.filter(c=>c.action==='member').length,2);
 assert.equal(f.view.dirty,false);
 await f.window.happyDOM.close();
});


const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

test('a late account save after session reset cannot refresh or mark the new people view as saved',async()=>{
 const gate=deferred();const f=fixture({beforeCall:async a=>{if(a==='admin_user')await gate.promise;}});
 await f.click(f.person('writer@test.ch'));await f.click(f.button('Berechtigungen'));
 const quota=f.input('Speicherlimit in MB');quota.value='300';quota.oninput();
 const role=f.input('Rolle in Kurs');role.value='reader';role.onchange();
 const saving=f.click(f.button('Änderungen speichern'));await Promise.resolve();
 f.view.reset();f.view.mount(f.host);
 await f.click(f.person('reader@test.ch'));
 gate.resolve();await saving;
 assert.equal(f.calls.filter(c=>c.action==='member').length,0);
 assert.doesNotMatch(f.host.textContent,/Änderungen gespeichert/);
 assert.equal(f.person('reader@test.ch').getAttribute('aria-expanded'),'true');
 await f.window.happyDOM.close();
});

test('duplicate saves during confirmation show one prompt and a reset invalidates its answer',async()=>{
 const prompt=deferred();const f=fixture({confirmation:()=>prompt.promise});
 await f.click(f.person('writer@test.ch'));await f.click(f.button('Berechtigungen'));
 const enabled=f.input('Figuren hochladen und Bibliotheken erstellen');enabled.checked=false;enabled.onchange();
 const save=f.button('Änderungen speichern');const first=f.click(save),second=f.click(save);
 assert.equal(f.prompts.length,1);
 f.view.reset();f.view.mount(f.host);prompt.resolve(true);
 await Promise.all([first,second]);
 assert.equal(f.calls.filter(c=>c.action==='admin_user').length,0);
 await f.window.happyDOM.close();
});

test('the add-person wizard retries a failed assignment without creating the person twice',async()=>{
 const f=fixture({failMember:true});await f.click(f.button('Person hinzufügen'));
 const email=f.input('E-Mail-Adresse der neuen Person');email.value='new@test.ch';email.oninput();
 await f.click(f.button('Weiter'));await f.click(f.button('Weiter'));
 const role=f.input('Kurs');role.value='reader';role.onchange();
 await f.click(f.button('Person anlegen'));
 assert.match(f.host.textContent,/Zuweisung fehlgeschlagen/);
 await f.click(f.button('Offene Zuweisungen erneut speichern'));
 assert.equal(f.calls.filter(c=>c.action==='admin_user').length,1);
 assert.equal(f.calls.filter(c=>c.action==='member').length,2);
 assert.equal(f.person('new@test.ch').getAttribute('aria-expanded'),'true');
 assert.equal(f.view.dirty,false);
 await f.window.happyDOM.close();
});

test('leaving after a partial save keeps the saved quota and discards only pending access',async()=>{
 const f=fixture({failMember:true});await f.click(f.person('writer@test.ch'));await f.click(f.button('Berechtigungen'));
 const quota=f.input('Speicherlimit in MB');quota.value='300';quota.oninput();
 const role=f.input('Rolle in Kurs');role.value='reader';role.onchange();
 await assert.rejects(f.click(f.button('Änderungen speichern')),/Zuweisung fehlgeschlagen/);
 f.setAnswer(true);await f.click(f.person('reader@test.ch'));
 assert.equal(f.state.people[0].quota,300000000);
 assert.equal(f.view.dirty,false);
 assert.equal(f.calls.filter(c=>c.action==='admin_user').length,1);
 await f.window.happyDOM.close();
});

test('a fresh people read replaces a clean draft after saving',async()=>{
 const f=fixture();await f.click(f.person('writer@test.ch'));await f.click(f.button('Berechtigungen'));
 let quota=f.input('Speicherlimit in MB');quota.value='300';quota.oninput();await f.click(f.button('Änderungen speichern'));
 f.state.people[0].quota=350000000;f.view.mount(f.host);
 quota=f.input('Speicherlimit in MB');assert.equal(quota.value,'350');assert.equal(f.view.dirty,false);
 await f.window.happyDOM.close();
});

test('a late discard answer cannot discard a draft from the new session',async()=>{
 const prompt=deferred();const f=fixture({confirmation:()=>prompt.promise});
 await f.click(f.person('writer@test.ch'));await f.click(f.button('Berechtigungen'));
 let quota=f.input('Speicherlimit in MB');quota.value='300';quota.oninput();
 const leaving=f.view.leave();f.view.reset();f.view.mount(f.host);
 await f.click(f.person('reader@test.ch'));await f.click(f.button('Berechtigungen'));
 quota=f.input('Speicherlimit in MB');quota.value='100';quota.oninput();
 prompt.resolve(true);assert.equal(await leaving,false);assert.equal(f.view.dirty,true);
 await f.window.happyDOM.close();
});
