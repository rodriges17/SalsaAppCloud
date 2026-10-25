import { videoHash } from './cloud-dedup.js';
import { readCloudCache, writeCloudCache } from './cloud-cache.js';

const validHash = value => /^[a-f0-9]{64}$/.test(value);
export function createVideoHashMemo(read, write) {
  const pending = new Map();
  const valid = value => value && Number.isSafeInteger(value.size) && validHash(value.hash);
  return {
    async get(key, compute) {
      if (!key) return compute();
      if (pending.has(key)) return pending.get(key);
      const work = (async () => {
        let saved;
        try { saved = await read(key); } catch { /* Cache is optional. */ }
        if (valid(saved)) return saved;
        const value = await compute();
        if (valid(value)) try { await write(key, value); } catch { /* Keep the verified result usable. */ }
        return value;
      })();
      pending.set(key, work);
      try { return await work; } finally { pending.delete(key); }
    }
  };
}
const memo = createVideoHashMemo(
  async key => (await readCloudCache('@local-video-hashes', key))?.value,
  (key, value) => writeCloudCache('@local-video-hashes', key, value)
);

// Call only after byte/hash verification and a successful atomic storage save.
export async function rememberLocalVideoHash(record, size, hash) {
  if (!validHash(hash) || !Number.isSafeInteger(size)) return;
  await memo.get(await record.contentKey?.(), async () => ({ size, hash }));
}

// Reuse hashes only after checking the current file's identity and availability.
export async function localVideoContent(figures, readMedia, active = () => true, cache = memo, onVideo = () => {}) {
  const hashes = new Map();
  for (const figure of figures) {
    if (!active()) break;
    if (figure.storageProblem || figure.folderAccessRequired) continue;
    let records;
    try { records = await readMedia(figure); } catch { continue; }
    for (const record of records) {
      if (!active()) return hashes;
      try {
        const key = await record.contentKey?.();
        const { size, hash } = await cache.get(key, async () => {
          const { blob } = await record.load();
          return { size: blob.size, hash: await videoHash(blob) };
        });
        if (!hashes.has(size)) hashes.set(size, new Set());
        hashes.get(size).add(hash);
        onVideo({ figure, record, size, hash });
      } catch { /* A missing file must not hide other readable local videos. */ }
    }
  }
  return hashes;
}

export async function matchingLocalVideos(revision, hashes, readMedia, active = () => true) {
  const matched = new Set();
  for (const video of revision.videos) {
    if (!active()) break;
    const candidates = hashes.get(video.size);
    if (!candidates?.size) continue;
    try {
      const media = await readMedia({ revision: revision.id, media: video.id });
      if (/^[a-f0-9]{64}$/.test(media.content_hash) && candidates.has(media.content_hash)) matched.add(video.id);
    } catch { /* Offline or denied metadata never counts as a content match. */ }
  }
  return matched;
}
