import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTags, timeLabel, filterFigures, ABLoop, validateDraft } from '../pwa/logic.js';

test('search includes descriptions and tags, combines filters and sorts learning progression', () => {
  const figures = [
    { title: 'Ocho', description: 'Drehung', status: 'Am Üben', tags: ['Anfänger'], createdAt: 2 },
    { title: 'Caracol', description: '', status: 'Sitzt', tags: ['Drehung'], createdAt: 3 },
    { title: 'Sombrero', description: '', status: 'Neu', tags: [], createdAt: 1 }
  ];
  assert.deepEqual(filterFigures(figures, { query: 'DREHUNG' }).map(f => f.title), ['Caracol', 'Ocho']);
  assert.deepEqual(filterFigures(figures, { query: 'anfänger', status: 'Am Üben', tag: 'Anfänger' }).map(f => f.title), ['Ocho']);
  assert.deepEqual(filterFigures(figures, { sort: 'status' }).map(f => f.title), ['Sombrero', 'Ocho', 'Caracol']);
  assert.deepEqual(filterFigures(figures, { sort: 'name' }).map(f => f.title), ['Caracol', 'Ocho', 'Sombrero']);
});
test('tag parsing and duration labels handle empty, duplicate and invalid values', () => {
  assert.deepEqual(cleanTags(' neu, Drehung, neu, , '), ['neu', 'Drehung']);
  assert.equal(timeLabel(65.9), '1:05'); assert.equal(timeLabel(Infinity), '0:00'); assert.equal(timeLabel(-10), '0:00');
});
test('AB marks enforce order, reset B after A and repeat at exact end', () => {
  const loop = new ABLoop(); loop.setA(2); loop.setB(1); assert.equal(loop.b, null);
  loop.setB(5); assert.equal(loop.target(4.99), null); assert.equal(loop.target(5), 2); assert.equal(loop.target(4, true), 2);
  loop.setA(3); assert.equal(loop.b, null); loop.clear(); assert.equal(loop.target(10, true), null);
});
test('saving requires a title, nonempty confirmed media and unique draft IDs', () => {
  const draft = { id: 'a', blob: new Blob(['video']), duration: 1, confirmed: true };
  assert.doesNotThrow(() => validateDraft('Ocho', [draft]));
  assert.throws(() => validateDraft('', [draft])); assert.throws(() => validateDraft('Ocho', []));
  assert.throws(() => validateDraft('Ocho', [{ ...draft, confirmed: false }]));
  assert.throws(() => validateDraft('Ocho', [draft, draft]));
  assert.throws(() => validateDraft('Ocho', [{ ...draft, duration: Infinity }]));
});
