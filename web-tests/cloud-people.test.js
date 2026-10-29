import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createPeopleView} from '../pwa/cloud-people.js';

function fixture() {
 const window=new Window(),document=window.document;
 const state={me:{id:'self',is_admin:true},people:[{id:'writer',name:'Anna',email:'writer@test.ch',upload_enabled:true,quota:250000000,used:0},{id:'self',email:'admin@test.ch',is_admin:true,upload_enabled:true,quota:500000000,used:0},{id:'reader',email:'reader@test.ch',upload_enabled:false,quota:0,used:0}],libraries:[{id:'lib',title:'Kurs',manage:true,collaborative:true}],settings:{used:0,total_limit:900000000}};
 const calls=[],prompts=[];let answer=false,view;
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const action=(label,work)=>{const b=node('button',label);b.type='button';b.onclick=work;return b;};
 const field=(form,label,value='',type='text')=>{const l=node('label',label),i=node('input');i.type=type;i.value=String(value);l.append(i);form.append(l);return i;};
 const checkbox=(form,label,checked)=>{const i=field(form,label,'','checkbox');i.checked=checked;return i;};
 const select=(form,label,options,value)=>{const l=node('label',label),s=node('select');for(const[v,t]of options){const o=node('option',t);o.value=v;s.append(o)}if(value!==undefined)s.value=value;l.append(s);form.append(l);return s;};
 const host=node('section');document.body.append(host);
 view=createPeopleView({node,action,field,select,checkbox,state:()=>state,confirm:async opts=>{prompts.push(opts);return answer;},run:async(message,work)=>work(),call:async(a,p)=>{calls.push({action:a,payload:p});if(a==='admin_access')return {memberships:[]};if(a==='admin_user'){const u=state.people.find(x=>x.email===p.email);u.quota=p.quota;u.upload_enabled=p.enabled;}return {};},refresh:async()=>view.mount(host),report:e=>{throw e;},account:()=>{},extraManagement:()=>action('Videos prüfen',()=>{})});
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
