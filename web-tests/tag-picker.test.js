import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountTagPicker} from '../pwa/tag-picker.js';

test('choosing a suggested tag clears the search and preserves selections for the next tag', async()=>{
 const window=new Window();globalThis.document=window.document;const oldEvent=globalThis.Event;globalThis.Event=window.Event;
 const input=document.createElement('input');input.id='tags';document.body.append(input);
 const changes=[],picker=mountTagPicker(input,{value:['Behalten'],suggestions:['Figur','Footwork'],onChange:tags=>changes.push(tags)});
 const search=text=>{input.value=text;input.dispatchEvent(new window.Event('input'));};
 const option=name=>[...document.querySelectorAll('[role=option]')].find(n=>n.textContent===name);
 try {
  search('f');option('Figur').click();
  assert.equal(input.value,'');assert.deepEqual(picker.value,['Behalten','Figur']);
  assert.equal(input.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,input);
  search('foo');option('Footwork').click();
  assert.equal(input.value,'');assert.deepEqual(picker.value,['Behalten','Figur','Footwork']);
  assert.deepEqual(changes,[['Behalten','Figur'],['Behalten','Figur','Footwork']]);
 } finally {picker.destroy();await window.happyDOM.close();delete globalThis.document;globalThis.Event=oldEvent;}
});
