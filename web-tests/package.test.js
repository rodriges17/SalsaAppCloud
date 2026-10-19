import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportFigure, importFigure, writeZip, checksum, packageFilename, MAX_PACKAGE_BYTES } from '../pwa/package.js';
const figure = { title: 'Drehung', description: '1, 2, 3 …', tags: ['Salsa', 'Anfänger'], status: 'Sitzt', id: 'private-id' };
const records = [{ name: 'Führung', blob: new Blob([new Uint8Array([0, 1, 2, 255])], { type: 'video/mp4' }) }, { name: 'Andere Perspektive', blob: new Blob(['second'], { type: 'video/quicktime' }) }];
test('ZIP roundtrip preserves bytes, Unicode, order and names, excludes personal progress', async () => {
 const zip = await exportFigure(figure, records), imported = await importFigure(zip);
 assert.equal(imported.title, figure.title); assert.equal(imported.description, figure.description); assert.deepEqual(imported.tags, figure.tags);
 assert.equal(imported.status, undefined); assert.equal(imported.id, undefined);
 for (let i = 0; i < records.length; i++) { assert.equal(imported.drafts[i].name, records[i].name); assert.equal(imported.drafts[i].confirmed, false); assert.deepEqual(await imported.drafts[i].blob.arrayBuffer(), await records[i].blob.arrayBuffer()); }
 assert.equal((await importFigure(await exportFigure({ ...figure, status: 'Neu', id: 'other' }, records))).fingerprint, imported.fingerprint);
});
test('selection only exports chosen videos; changed content changes fingerprint', async () => {
 const all = await importFigure(await exportFigure(figure, records));
 const one = await importFigure(await exportFigure(figure, records.slice(1)));
 assert.equal(one.drafts.length, 1); assert.equal(one.drafts[0].name, records[1].name); assert.notEqual(all.fingerprint, one.fingerprint);
});
test('empty selection, unsupported media and oversized packages are rejected', async () => {
 await assert.rejects(exportFigure(figure, [])); await assert.rejects(exportFigure(figure, [{ name: '', blob: new Blob(['x'], { type: 'text/html' }) }]));
 const huge = new Blob(Array(251).fill(new Uint8Array(1048576)), { type: 'video/mp4' });
 await assert.rejects(exportFigure(figure, [{ name: '', blob: huge }]), /250 MB/); await assert.rejects(importFigure(huge), /250 MB/);
 assert.equal(MAX_PACKAGE_BYTES, 262144000);
});
test('corruption, truncation and arbitrary ZIP data are rejected', async () => {
 const zip = await exportFigure(figure, records); const bytes = new Uint8Array(await zip.arrayBuffer()); bytes[50] ^= 1;
 await assert.rejects(importFigure(new Blob([bytes])), /beschädigt/);
 await assert.rejects(importFigure(zip.slice(0, -1))); await assert.rejects(importFigure(new Blob(['not a zip'])));
});
test('reject path traversal, duplicate entries, compressed entries and unknown schema', async () => {
 await assert.rejects(importFigure(await writeZip([{ path: '../figure.json', blob: new Blob(['{}']) }])));
 await assert.rejects(importFigure(await writeZip([{ path: 'figure.json', blob: new Blob(['{}']) }, { path: 'figure.json', blob: new Blob(['{}']) }])));
 await assert.rejects(importFigure(await writeZip([{ path: 'figure.json', blob: new Blob([JSON.stringify({ format: 'salsa-figure', version: 999 })]) }])), /Version/);
 const bytes = new Uint8Array(await (await exportFigure(figure, records)).arrayBuffer()); const view = new DataView(bytes.buffer); const central = view.getUint32(bytes.length - 6, true); view.setUint16(central + 10, 8, true);
 await assert.rejects(importFigure(new Blob([bytes])));
});
test('bounded metadata rejects invalid types and missing video entries', async () => {
 for (const m of [null, { format: 'salsa-figure', version: 1, title: 1 }, { format: 'salsa-figure', version: 1, title: 'x', description: '', tags: [], videos: [{path:'videos/1.mp4',name:'x',type:'video/mp4',size:1}] }]) {
  await assert.rejects(importFigure(await writeZip([{ path: 'figure.json', blob: new Blob([JSON.stringify(m)]) }])));
 }
});
test('checksum matches standard CRC32; canceled exports stop', async () => {
 assert.equal(await checksum(new Blob(['123456789'])), 0xcbf43926);
 const controller = new AbortController(); controller.abort(); await assert.rejects(exportFigure(figure, records, controller.signal), { name: 'AbortError' });
});
test('filename removes unsafe path characters', () => { assert.equal(packageFilename('../Salsa / Figur?'), 'Salsa  Figur.zip'); assert.equal(packageFilename('💃'), 'Salsa-Figur.zip'); });
