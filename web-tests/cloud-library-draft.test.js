import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLibraryDraft} from '../pwa/cloud-library-draft.js';
const lib={id:'lib',title:'Kurs',description:'Text',visibility:'private',collaborative:false,moderated:true,edit_version:'v1'};
const entries=[{figure_id:'a'},{figure_id:'b'}];
test('library draft stages reorder, remove and multi-add without mutating saved entries',()=>{
 const d=createLibraryDraft(lib,entries);assert.equal(d.dirty,false);d.move('b',0);assert.equal(d.dirty,true);d.move('b',1);assert.equal(d.dirty,false);
 d.remove('a');d.add({id:'c',revisions:[{id:'rev-c',title:'C'}]});assert.equal(d.add({id:'c',revisions:[{id:'rev-c'}]}),false);
 assert.deepEqual(d.payload().order,['b','c']);assert.deepEqual(d.payload().additions,[{figure:'c',revision:'rev-c'}]);
 assert.deepEqual(entries.map(e=>e.figure_id),['a','b']);assert.equal(lib.title,'Kurs');
 d.remove('c');assert.deepEqual(d.payload().additions,[]);d.add({id:'a',revisions:[{id:'rev-a'}]});assert.deepEqual(d.payload().additions,[]);
});
test('library settings are part of the same payload and can return to a clean state',()=>{
 const d=createLibraryDraft(lib,entries);d.data.title='Neu';d.data.visibility='public';assert.equal(d.dirty,true);assert.equal(d.payload().expected_version,'v1');
 Object.assign(d.data,{title:'Kurs',visibility:'private'});assert.equal(d.dirty,false);const ids=d.ids;ids.pop();assert.deepEqual(d.ids,['a','b']);
});
