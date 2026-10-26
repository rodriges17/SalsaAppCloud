import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryOrder } from '../pwa/cloud-library-order.js';
test('order draft moves both ways without mutating entries, restores clean state', () => {
 const entries=['a','b','c'].map(figure_id=>({figure_id})),order=createLibraryOrder(entries);
 assert.equal(order.dirty,false);assert.equal(order.move('c',0),true);
 assert.deepEqual(order.ids,['c','a','b']);assert.equal(order.dirty,true);
 assert.deepEqual(entries.map(e=>e.figure_id),['a','b','c']);
 order.move('c',2);assert.equal(order.dirty,false);
 for(const [id,index] of [['a',-1],['a',3],['unknown',0],['a',0],['a',1.5]])assert.equal(order.move(id,index),false);
 const copy=order.ids;copy.reverse();assert.deepEqual(order.ids,['a','b','c']);
});
