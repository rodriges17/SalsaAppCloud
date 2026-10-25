import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoHash } from '../pwa/cloud-dedup.js';
test('media identity uses exact bytes, independent of file name and declared MIME', async () => {
  const first = new File(['abc'], 'eins.mp4', { type: 'video/mp4' });
  const renamed = new File(['abc'], 'zwei.mov', { type: 'video/quicktime' });
  assert.equal(await videoHash(first), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await videoHash(first), await videoHash(renamed));
  assert.notEqual(await videoHash(first), await videoHash(new Blob(['abd'])));
});
