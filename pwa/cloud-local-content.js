import { videoHash } from './cloud-dedup.js';

// Rebuild from readable bytes: names and old upload links are not content identity.
export async function localVideoContent(figures, readMedia, active = () => true) {
  const hashes = new Map();
  for (const figure of figures) {
    if (!active()) break;
    if (figure.storageProblem || figure.folderAccessRequired) continue;
    let records;
    try { records = await readMedia(figure); } catch { continue; }
    for (const record of records) {
      if (!active()) return hashes;
      try {
        const { blob } = await record.load();
        const hash = await videoHash(blob);
        if (!hashes.has(blob.size)) hashes.set(blob.size, new Set());
        hashes.get(blob.size).add(hash);
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
